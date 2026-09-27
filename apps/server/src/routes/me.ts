import {
  changePasswordSchema,
  idSchema,
  meSchema,
  sessionInfoSchema,
  updateMeSchema,
} from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { clearSessionCookie } from '../auth/cookies.js'
import { requireAuthState } from '../context.js'
import { AppError } from '../lib/errors.js'
import { enforceRateLimit } from '../middleware/rate-limit.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import { toSessionInfo } from '../services/users.js'
import {
  authErrors,
  commonErrors,
  createRouter,
  errorResponse,
  jsonBody,
  jsonResponse,
  noContent,
} from './openapi.js'

const tags = ['Account']
const security = [{ session: [] }]

export function meRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      security,
      summary: 'The signed-in user',
      responses: { 200: jsonResponse(meSchema, 'The signed-in user'), ...authErrors },
    }),
    (c) => c.json(services.users.toMe(requireAuthState(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/',
      tags,
      security,
      summary: 'Update profile, language, time zone or preferences',
      request: { body: jsonBody(updateMeSchema) },
      responses: {
        200: jsonResponse(meSchema, 'The updated user'),
        409: errorResponse('Username or email is already taken'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => {
      const { user } = requireAuthState(c)
      const updated = services.users.update(user.id, c.req.valid('json'))
      return c.json(services.users.toMe(updated), 200)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/password',
      tags,
      security,
      summary: 'Change (or set) the password',
      description: 'Signs out all other sessions.',
      request: { body: jsonBody(changePasswordSchema) },
      responses: { 204: noContent, ...authErrors, ...commonErrors },
    }),
    async (c) => {
      const { user, session } = requireAuthState(c)
      enforceRateLimit(services.limits.loginPerAccount, `password:${user.id}`)
      await services.auth.changePassword(user, session.id, c.req.valid('json'))
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/sessions',
      tags,
      security,
      summary: 'Devices where the user is signed in',
      responses: {
        200: jsonResponse(z.array(sessionInfoSchema), 'Active sessions, most recent first'),
        ...authErrors,
      },
    }),
    (c) => {
      const { user, session } = requireAuthState(c)
      const list = services.sessions
        .listForUser(user.id)
        .map((row) => toSessionInfo(row, session.id))
      return c.json(list, 200)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/sessions',
      tags,
      security,
      summary: 'Sign out on all other devices',
      responses: { 204: noContent, ...authErrors },
    }),
    (c) => {
      const { user, session } = requireAuthState(c)
      services.sessions.revokeAllForUser(user.id, session.id)
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/sessions/{id}',
      tags,
      security,
      summary: 'Sign out one device',
      request: { params: z.object({ id: idSchema }) },
      responses: {
        204: noContent,
        404: errorResponse('No such session'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => {
      const { user, session } = requireAuthState(c)
      const { id } = c.req.valid('param')
      if (!services.sessions.revoke(user.id, id)) throw new AppError(404, 'not_found')
      if (id === session.id) clearSessionCookie(c, services.config)
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/identities/oidc',
      tags,
      security,
      summary: 'Unlink the single sign-on identity',
      responses: {
        204: noContent,
        409: errorResponse('The account has no password, so SSO is its only sign-in method'),
        ...authErrors,
      },
    }),
    (c) => {
      services.auth.unlinkOidc(requireAuthState(c).user)
      return c.body(null, 204)
    },
  )

  return router
}
