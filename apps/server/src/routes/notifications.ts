import {
  channelSchema,
  createChannelSchema,
  idSchema,
  pushStatusSchema,
  pushSubscriptionSchema,
  updateChannelSchema,
} from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import {
  authErrors,
  commonErrors,
  createRouter,
  errorResponse,
  jsonBody,
  jsonResponse,
  noContent,
  sessionOnly,
} from './openapi.js'

const tags = ['Notifications']
const security = sessionOnly
const idParams = z.object({ id: idSchema })
const notFound = { 404: errorResponse('No such channel or device') }
const deliveryFailed = {
  502: errorResponse(
    'The message could not be delivered; `details.reason` says why ' +
      '(`timeout`, `dns`, `unreachable`, `blocked`, `smtp`, `config`, `gone` or `http:<status>`)',
  ),
}

export function notificationRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/channels',
      tags,
      security,
      summary: 'Notification channels of the signed-in user',
      description: 'Access tokens are never returned.',
      responses: { 200: jsonResponse(z.array(channelSchema), 'Channels'), ...authErrors },
    }),
    (c) => c.json(services.notifications.listChannels(requireAuthState(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/channels',
      tags,
      security,
      summary: 'Add a notification channel',
      description:
        'ntfy, Gotify, an Apprise API server, or email to the account’s address (needs SMTP).',
      request: { body: jsonBody(createChannelSchema) },
      responses: {
        201: jsonResponse(channelSchema, 'The new channel'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.notifications.createChannel(requireAuthState(c).user, c.req.valid('json')),
        201,
      ),
  )

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/channels/{id}',
      tags,
      security,
      summary: 'Rename, pause or resume a channel',
      request: { params: idParams, body: jsonBody(updateChannelSchema) },
      responses: {
        200: jsonResponse(channelSchema, 'The updated channel'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.notifications.updateChannel(
          requireAuthState(c).user,
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
        200,
      ),
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/channels/{id}',
      tags,
      security,
      summary: 'Remove a channel',
      request: { params: idParams },
      responses: { 204: noContent, ...notFound, ...authErrors, ...commonErrors },
    }),
    (c) => {
      services.notifications.deleteChannel(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/channels/{id}/test',
      tags,
      security,
      summary: 'Send a test message to a channel',
      request: { params: idParams },
      responses: {
        200: jsonResponse(channelSchema, 'Delivered; the channel with its new status'),
        ...deliveryFailed,
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) =>
      c.json(
        await services.notifications.testChannel(requireAuthState(c).user, c.req.valid('param').id),
        200,
      ),
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/push',
      tags,
      security,
      summary: 'Web Push key and subscribed browsers',
      responses: { 200: jsonResponse(pushStatusSchema, 'Web Push status'), ...authErrors },
    }),
    (c) => c.json(services.notifications.pushStatus(requireAuthState(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/push',
      tags,
      security,
      summary: 'Subscribe this browser to Web Push',
      description: 'Takes `PushSubscription.toJSON()`. Subscribing again updates the keys.',
      request: { body: jsonBody(pushSubscriptionSchema) },
      responses: { 204: noContent, ...authErrors, ...commonErrors },
    }),
    (c) => {
      services.notifications.subscribePush(
        requireAuthState(c).user,
        c.req.valid('json'),
        c.req.header('user-agent'),
      )
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/push/{id}',
      tags,
      security,
      summary: 'Stop sending Web Push to a browser',
      request: { params: idParams },
      responses: { 204: noContent, ...notFound, ...authErrors, ...commonErrors },
    }),
    (c) => {
      services.notifications.removePushDevice(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/push/test',
      tags,
      security,
      summary: 'Send a test message to every subscribed browser',
      responses: {
        204: noContent,
        404: errorResponse('No browser is subscribed'),
        ...deliveryFailed,
        ...authErrors,
        ...commonErrors,
      },
    }),
    async (c) => {
      await services.notifications.testPush(requireAuthState(c).user)
      return c.body(null, 204)
    },
  )

  return router
}
