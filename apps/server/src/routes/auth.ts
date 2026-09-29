import {
  authConfigSchema,
  forgotPasswordSchema,
  loginSchema,
  meSchema,
  registerSchema,
  resetPasswordSchema,
} from '@crystal/shared'
import { createRoute } from '@hono/zod-openapi'

import {
  clearSessionCookie,
  readSessionToken,
  setOidcFlowCookie,
  takeOidcFlowCookie,
} from '../auth/cookies.js'
import type { OidcIntent } from '../auth/oidc.js'
import type { AppContext } from '../context.js'
import { AppError } from '../lib/errors.js'
import { enforceRateLimit } from '../middleware/rate-limit.js'
import type { Services } from '../services/index.js'
import {
  commonErrors,
  createRouter,
  errorResponse,
  jsonBody,
  jsonResponse,
  noContent,
} from './openapi.js'
import { startSession } from './session-helpers.js'

export function authRoutes(services: Services) {
  const router = createRouter()
  const ipKey = (c: AppContext) => `ip:${c.get('clientIp') ?? 'unknown'}`

  router.openapi(
    createRoute({
      method: 'get',
      path: '/config',
      tags: ['Auth'],
      summary: 'Public instance configuration',
      description: 'Everything the sign-in screen needs to know before anyone is signed in.',
      responses: { 200: jsonResponse(authConfigSchema, 'Instance configuration') },
    }),
    (c) => c.json(services.auth.getConfig(), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/register',
      tags: ['Auth'],
      summary: 'Create an account',
      description:
        'The first account on an instance becomes an administrator. Afterwards, `REGISTRATION` ' +
        'decides whether an invite token is required.',
      request: { body: jsonBody(registerSchema) },
      responses: {
        201: jsonResponse(meSchema, 'The account was created and the session cookie set'),
        403: errorResponse('Registration is closed or password sign-in is disabled'),
        409: errorResponse('Username or email is already taken'),
        ...commonErrors,
      },
    }),
    async (c) => {
      enforceRateLimit(services.limits.register, ipKey(c))
      const user = await services.auth.register(c.req.valid('json'))
      startSession(c, services, user)
      return c.json(services.users.toMe(user), 201)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/login',
      tags: ['Auth'],
      summary: 'Sign in with username (or email) and password',
      request: { body: jsonBody(loginSchema) },
      responses: {
        200: jsonResponse(meSchema, 'Signed in; the session cookie is set'),
        401: errorResponse('Wrong username or password'),
        403: errorResponse('The account is disabled or password sign-in is turned off'),
        ...commonErrors,
      },
    }),
    async (c) => {
      const input = c.req.valid('json')
      enforceRateLimit(services.limits.loginPerIp, ipKey(c))
      const accountKey = `${ipKey(c)}:${input.identifier}`
      enforceRateLimit(services.limits.loginPerAccount, accountKey)
      const user = await services.auth.login(input)
      // Only failed attempts count against the account.
      services.limits.loginPerAccount.reset(accountKey)
      startSession(c, services, user)
      return c.json(services.users.toMe(user), 200)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/forgot-password',
      tags: ['Auth'],
      summary: 'Request a password reset link by email',
      description:
        'Sends a link that is valid for one hour to the account’s email address. The answer is ' +
        'the same whether or not the account exists. Needs SMTP and `BASE_URL` ' +
        '(see `passwordReset` in the instance configuration).',
      request: { body: jsonBody(forgotPasswordSchema) },
      responses: {
        204: noContent,
        403: errorResponse('Password sign-in is disabled'),
        ...commonErrors,
      },
    }),
    (c) => {
      enforceRateLimit(services.limits.passwordReset, ipKey(c))
      services.passwordResets.request(c.req.valid('json'))
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/reset-password',
      tags: ['Auth'],
      summary: 'Choose a new password with a reset link',
      description: 'Uses up the link and signs the account out everywhere.',
      request: { body: jsonBody(resetPasswordSchema) },
      responses: {
        204: noContent,
        403: errorResponse('Password sign-in is disabled'),
        ...commonErrors,
      },
    }),
    async (c) => {
      enforceRateLimit(services.limits.passwordReset, ipKey(c))
      await services.passwordResets.reset(c.req.valid('json'))
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/logout',
      tags: ['Auth'],
      summary: 'Sign out of the current session',
      responses: { 204: noContent },
    }),
    (c) => {
      const token = readSessionToken(c)
      if (token) services.sessions.revokeByToken(token)
      clearSessionCookie(c, services.config)
      return c.body(null, 204)
    },
  )

  // Browser navigations, not JSON endpoints, so they are not part of the OpenAPI document.
  router.get('/oidc/start', async (c) => {
    const intent: OidcIntent = c.req.query('intent') === 'link' ? 'link' : 'login'
    const auth = c.get('auth')
    if (!services.oidc) return c.redirect(errorTarget(intent, 'oidc_not_configured'), 302)
    if (intent === 'link' && !auth) return c.redirect('/login', 302)

    try {
      const { url, flowCookie } = await services.oidc.createAuthorizationRequest(
        intent,
        auth?.user.id,
      )
      setOidcFlowCookie(c, services.config, flowCookie)
      return c.redirect(url.href, 302)
    } catch (error) {
      return c.redirect(errorTarget(intent, errorCode(error)), 302)
    }
  })

  router.get('/oidc/callback', async (c) => {
    const flowCookie = takeOidcFlowCookie(c, services.config)
    const { oidc, config } = services
    if (!oidc || !config.baseUrl)
      return c.redirect(errorTarget('login', 'oidc_not_configured'), 302)

    let intent: OidcIntent = 'login'
    try {
      // The provider validates the redirect URI, so rebuild it from the public URL.
      const requestUrl = new URL(c.req.url)
      const callbackUrl = new URL(requestUrl.pathname + requestUrl.search, config.baseUrl)
      const result = await oidc.handleCallback(callbackUrl, flowCookie)
      intent = result.intent

      if (intent === 'link' && c.get('auth')?.user.id !== result.userId) {
        throw new AppError(401, 'unauthorized')
      }
      const user = services.auth.completeOidc(result, c.req.header('accept-language'))
      if (intent === 'login') {
        startSession(c, services, user)
        return c.redirect('/', 302)
      }
      return c.redirect('/settings/account?sso=linked', 302)
    } catch (error) {
      if (!(error instanceof AppError)) {
        services.logger.error({ err: error }, 'OIDC callback failed')
      }
      return c.redirect(errorTarget(intent, errorCode(error)), 302)
    }
  })

  return router
}

function errorCode(error: unknown): string {
  return error instanceof AppError ? error.code : 'oidc_failed'
}

function errorTarget(intent: OidcIntent, code: string): string {
  const path = intent === 'link' ? '/settings/account' : '/login'
  return `${path}?error=${encodeURIComponent(code)}`
}
