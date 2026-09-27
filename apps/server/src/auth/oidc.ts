import * as client from 'openid-client'
import { z } from 'zod'

import type { OidcConfig } from '../config.js'
import { seal, unseal } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'

export const OIDC_INTENTS = ['login', 'link'] as const
export type OidcIntent = (typeof OIDC_INTENTS)[number]

/** How long a user may take at the identity provider before the flow expires. */
const FLOW_TTL_MS = 10 * 60 * 1000

const flowStateSchema = z.object({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  intent: z.enum(OIDC_INTENTS),
  userId: z.string().optional(),
  expiresAt: z.number(),
})
type FlowState = z.infer<typeof flowStateSchema>

export interface OidcClaims {
  issuer: string
  subject: string
  email: string | undefined
  name: string | undefined
  preferredUsername: string | undefined
  locale: string | undefined
  groups: string[]
}

export interface OidcResult {
  claims: OidcClaims
  intent: OidcIntent
  userId: string | undefined
}

/**
 * Authorization code flow with PKCE, state and nonce. The per-flow secrets live in
 * an encrypted, short-lived cookie, so no server-side storage is needed.
 */
export class OidcService {
  private configuration: Promise<client.Configuration> | undefined

  constructor(
    readonly config: OidcConfig,
    private readonly baseUrl: URL,
    private readonly sealKey: Buffer,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  get redirectUri(): string {
    return new URL('/api/v1/auth/oidc/callback', this.baseUrl).href
  }

  async createAuthorizationRequest(
    intent: OidcIntent,
    userId: string | undefined,
  ): Promise<{ url: URL; flowCookie: string }> {
    const configuration = await this.discover()
    const flow: FlowState = {
      state: client.randomState(),
      nonce: client.randomNonce(),
      verifier: client.randomPKCECodeVerifier(),
      intent,
      userId,
      expiresAt: this.now() + FLOW_TTL_MS,
    }
    const url = client.buildAuthorizationUrl(configuration, {
      redirect_uri: this.redirectUri,
      scope: this.config.scopes,
      state: flow.state,
      nonce: flow.nonce,
      code_challenge: await client.calculatePKCECodeChallenge(flow.verifier),
      code_challenge_method: 'S256',
    })
    return { url, flowCookie: seal(JSON.stringify(flow), this.sealKey) }
  }

  async handleCallback(callbackUrl: URL, flowCookie: string | undefined): Promise<OidcResult> {
    const flow = this.readFlow(flowCookie)
    if (!flow)
      throw new AppError(400, 'oidc_failed', 'The sign-in attempt expired. Please try again.')

    const configuration = await this.discover()
    let tokens: Awaited<ReturnType<typeof client.authorizationCodeGrant>>
    try {
      tokens = await client.authorizationCodeGrant(configuration, callbackUrl, {
        pkceCodeVerifier: flow.verifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      })
    } catch (error) {
      this.logger.warn({ err: error }, 'OIDC code exchange failed')
      throw new AppError(400, 'oidc_failed')
    }

    const idClaims = tokens.claims()
    if (!idClaims) throw new AppError(400, 'oidc_failed')

    // Profile data may only be available from the userinfo endpoint.
    let profile: Record<string, unknown> = { ...idClaims }
    try {
      const userInfo = await client.fetchUserInfo(configuration, tokens.access_token, idClaims.sub)
      profile = { ...profile, ...userInfo }
    } catch (error) {
      this.logger.debug({ err: error }, 'OIDC userinfo request failed, using ID token claims')
    }

    return {
      intent: flow.intent,
      userId: flow.userId,
      claims: {
        issuer: idClaims.iss,
        subject: idClaims.sub,
        email: stringClaim(profile.email)?.toLowerCase(),
        name: stringClaim(profile.name),
        preferredUsername: stringClaim(profile.preferred_username),
        locale: stringClaim(profile.locale),
        groups: groupsClaim(profile[this.config.groupsClaim]),
      },
    }
  }

  private readFlow(cookie: string | undefined): FlowState | undefined {
    if (!cookie) return undefined
    const raw = unseal(cookie, this.sealKey)
    if (!raw) return undefined
    try {
      const flow = flowStateSchema.parse(JSON.parse(raw))
      return flow.expiresAt > this.now() ? flow : undefined
    } catch {
      return undefined
    }
  }

  /** Fetches the provider metadata once; a failed attempt is retried on the next login. */
  private discover(): Promise<client.Configuration> {
    this.configuration ??= client
      .discovery(
        this.config.issuer,
        this.config.clientId,
        undefined,
        // `client_secret_basic` is the OIDC default and supported by all common providers.
        this.config.clientSecret
          ? client.ClientSecretBasic(this.config.clientSecret)
          : client.None(),
        this.config.issuer.protocol === 'http:' ? { execute: [client.allowInsecureRequests] } : {},
      )
      .catch((error: unknown) => {
        this.configuration = undefined
        this.logger.error({ err: error, issuer: this.config.issuer.href }, 'OIDC discovery failed')
        throw new AppError(502, 'oidc_failed', 'The identity provider is not reachable.')
      })
    return this.configuration
  }
}

function stringClaim(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function groupsClaim(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string') return value.split(/[\s,]+/).filter(Boolean)
  return []
}
