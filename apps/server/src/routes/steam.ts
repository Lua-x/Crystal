import {
  importSteamGameSchema,
  linkSteamSchema,
  listSchema,
  steamGameSchema,
  steamStatusSchema,
} from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { requireSession } from '../context.js'
import { enforceRateLimit } from '../middleware/rate-limit.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import {
  authErrors,
  commonErrors,
  createRouter,
  errorResponse,
  jsonBody,
  jsonResponse,
  sessionOnly,
} from './openapi.js'

const tags = ['Steam']
const security = sessionOnly
const steamErrors = {
  404: errorResponse('Steam is not set up on this instance (`steam_not_configured`)'),
  409: errorResponse(
    'No Steam account is linked (`steam_not_linked`), or its game details are private ' +
      '(`steam_profile_private`)',
  ),
  502: errorResponse('Steam could not be reached (`steam_unavailable`)'),
}

/** Linking a Steam account and importing games with their achievements. */
export function steamRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      security,
      summary: 'Whether Steam is set up, and the linked account',
      responses: { 200: jsonResponse(steamStatusSchema, 'Steam status'), ...authErrors },
    }),
    (c) => c.json(services.steam.status(requireSession(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'put',
      path: '/profile',
      tags,
      security,
      summary: 'Link a Steam account',
      description:
        'Accepts a profile link (`https://steamcommunity.com/id/…` or `/profiles/…`), a custom ' +
        'profile name or a SteamID64. Replaces an account linked before.',
      request: { body: jsonBody(linkSteamSchema) },
      responses: {
        200: jsonResponse(steamStatusSchema, 'The linked account'),
        400: errorResponse('No such Steam profile (`steam_profile_not_found`)'),
        ...steamErrors,
        ...authErrors,
        429: errorResponse('Too many requests'),
      },
    }),
    async (c) => {
      const { user } = requireSession(c)
      enforceRateLimit(services.limits.steam, user.id)
      return c.json(await services.steam.link(user, c.req.valid('json')), 200)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/profile',
      tags,
      security,
      summary: 'Unlink the Steam account',
      description: 'Imported games stay; they are no longer synced.',
      responses: { 200: jsonResponse(steamStatusSchema, 'Steam status'), ...authErrors },
    }),
    (c) => c.json(services.steam.unlink(requireSession(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/games',
      tags,
      security,
      summary: 'The games in the linked Steam library',
      description: 'Most played first. `listId` is set for games that were already imported.',
      responses: {
        200: jsonResponse(z.array(steamGameSchema), 'Games'),
        ...steamErrors,
        ...authErrors,
        429: errorResponse('Too many requests'),
      },
    }),
    async (c) => {
      const { user } = requireSession(c)
      enforceRateLimit(services.limits.steam, user.id)
      return c.json(await services.steam.games(user), 200)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/games',
      tags,
      security,
      summary: 'Import a Steam game with its achievements',
      description:
        'Creates a game with one goal per achievement, in the language of the account. ' +
        'Achievements the linked account already unlocked are completed at their unlock time.',
      request: { body: jsonBody(importSteamGameSchema) },
      responses: {
        201: jsonResponse(listSchema, 'The new game'),
        ...steamErrors,
        409: errorResponse(
          'Not linked, private, already imported (`steam_already_imported`) or without ' +
            'achievements (`steam_no_achievements`)',
        ),
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) => {
      const { user } = requireSession(c)
      enforceRateLimit(services.limits.steam, user.id)
      const listId = await services.steam.importGame(user, c.req.valid('json'))
      return c.json(services.lists.get(user, listId), 201)
    },
  )

  return router
}
