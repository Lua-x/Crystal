import type { Me } from '@crystal/shared'
import { Events, OAuth2Server, type MutableResponse, type MutableToken } from 'oauth2-mock-server'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'

import {
  createTestContext,
  PASSWORD,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

// A type alias (not an interface) so it is assignable to the mock's response body.
type Profile = {
  sub: string
  email?: string
  name?: string
  preferred_username?: string
  groups?: string[]
}

let provider: OAuth2Server
let context: TestContext

beforeAll(async () => {
  provider = new OAuth2Server()
  await provider.issuer.keys.generate('RS256')
  await provider.start(0, 'localhost')
})
afterAll(() => provider.stop())
afterEach(() => context.close())

function createOidcContext(env: Record<string, string> = {}) {
  context = createTestContext({
    OIDC_ISSUER: provider.issuer.url!,
    OIDC_CLIENT_ID: 'crystal',
    OIDC_CLIENT_SECRET: 'client-secret',
    OIDC_BUTTON_LABEL: 'Mock ID',
    ...env,
  })
  return context
}

/**
 * Makes the mock provider issue tokens and userinfo for `profile`. Every token
 * signed during a login (access and ID token) gets the claims, so the listeners
 * stay registered until the next call replaces them.
 */
function nextLoginAs(profile: Profile) {
  provider.service.removeAllListeners(Events.BeforeTokenSigning)
  provider.service.removeAllListeners(Events.BeforeUserinfo)
  provider.service.on(Events.BeforeTokenSigning, (token: MutableToken) => {
    Object.assign(token.payload, profile)
  })
  provider.service.on(Events.BeforeUserinfo, (response: MutableResponse) => {
    response.body = profile
  })
}

/** Runs the browser side of the authorization code flow and returns the final redirect. */
async function signInThroughProvider(client: TestClient, intent: 'login' | 'link' = 'login') {
  const start = await client.get(`/api/v1/auth/oidc/start?intent=${intent}`)
  expect(start.status).toBe(302)
  const authorizeUrl = new URL(start.headers.get('location')!)
  expect(authorizeUrl.origin).toBe(new URL(provider.issuer.url!).origin)
  expect(authorizeUrl.searchParams.get('code_challenge_method')).toBe('S256')
  expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
    'http://crystal.test/api/v1/auth/oidc/callback',
  )

  // The mock provider signs the user in immediately and redirects back.
  const authorize = await fetch(authorizeUrl, { redirect: 'manual' })
  const callbackUrl = new URL(authorize.headers.get('location')!)
  const callback = await client.get(callbackUrl.pathname + callbackUrl.search)
  expect(callback.status).toBe(302)
  return callback.headers.get('location')
}

describe('OIDC sign-in', () => {
  it('creates an account on first sign-in and reuses it afterwards', async () => {
    createOidcContext()
    const profile = {
      sub: 'user-123',
      email: 'Anna@Example.org',
      name: 'Anna Schmidt',
      preferred_username: 'anna',
    }

    const browser = context.client()
    nextLoginAs(profile)
    expect(await signInThroughProvider(browser)).toBe('/')

    const me = await browser.get<Me>('/api/v1/me')
    expect(me.body).toMatchObject({
      username: 'anna',
      displayName: 'Anna Schmidt',
      email: 'anna@example.org',
      role: 'admin',
      hasPassword: false,
    })
    expect(me.body.identities).toHaveLength(1)

    const secondBrowser = context.client()
    nextLoginAs(profile)
    await signInThroughProvider(secondBrowser)
    const again = await secondBrowser.get<Me>('/api/v1/me')
    expect(again.body.id).toBe(me.body.id)
  })

  it('does not take over a local account with the same email address', async () => {
    createOidcContext()
    await registerUser(context, 'anna', { email: 'anna@example.org' })

    nextLoginAs({ sub: 'user-456', email: 'anna@example.org', preferred_username: 'anna' })
    const browser = context.client()
    expect(await signInThroughProvider(browser)).toBe('/login?error=email_taken')
    expect((await browser.get('/api/v1/me')).status).toBe(401)
  })

  it('links an identity to an existing account from the settings', async () => {
    createOidcContext()
    const { client } = await registerUser(context, 'anna')

    nextLoginAs({ sub: 'user-789', email: 'anna@id.example.org' })
    expect(await signInThroughProvider(client, 'link')).toBe('/settings/account?sso=linked')

    const browser = context.client()
    nextLoginAs({ sub: 'user-789' })
    await signInThroughProvider(browser)
    expect((await browser.get<Me>('/api/v1/me')).body.username).toBe('anna')

    // Unlinking works because the account also has a password.
    expect((await client.delete('/api/v1/me/identities/oidc')).status).toBe(204)
    const login = await context
      .client()
      .post('/api/v1/auth/login', { identifier: 'anna', password: PASSWORD })
    expect(login.status).toBe(200)
  })

  it('refuses to unlink the only sign-in method', async () => {
    createOidcContext()
    const browser = context.client()
    nextLoginAs({ sub: 'user-sso-only', preferred_username: 'sso' })
    await signInThroughProvider(browser)

    const response = await browser.delete('/api/v1/me/identities/oidc')
    expect(response.status).toBe(409)
  })

  it('assigns the admin role from the configured group', async () => {
    createOidcContext({ OIDC_ADMIN_GROUP: 'crystal-admins', REGISTRATION: 'open' })
    await registerUser(context, 'owner')

    const browser = context.client()
    nextLoginAs({ sub: 'user-g1', preferred_username: 'ben', groups: ['crystal-admins'] })
    await signInThroughProvider(browser)
    expect((await browser.get<Me>('/api/v1/me')).body.role).toBe('admin')

    nextLoginAs({ sub: 'user-g1', preferred_username: 'ben', groups: [] })
    await signInThroughProvider(browser)
    expect((await browser.get<Me>('/api/v1/me')).body.role).toBe('user')
  })

  it('rejects unknown identities when auto-registration is off', async () => {
    createOidcContext({ OIDC_AUTO_REGISTER: 'false' })
    nextLoginAs({ sub: 'stranger' })
    expect(await signInThroughProvider(context.client())).toBe(
      '/login?error=oidc_account_not_found',
    )
  })

  it('rejects a callback without the flow cookie', async () => {
    createOidcContext()
    const browser = context.client()
    const start = await browser.get('/api/v1/auth/oidc/start')
    const authorize = await fetch(start.headers.get('location')!, { redirect: 'manual' })
    const callbackUrl = new URL(authorize.headers.get('location')!)

    const attacker = context.client()
    const callback = await attacker.get(callbackUrl.pathname + callbackUrl.search)
    expect(callback.headers.get('location')).toBe('/login?error=oidc_failed')
  })
})
