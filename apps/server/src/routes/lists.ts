import {
  createListGroupSchema,
  createListSchema,
  idSchema,
  listGroupSchema,
  listSchema,
  taskSchema,
  updateListGroupSchema,
  updateListSchema,
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
} from './openapi.js'

const tags = ['Lists']
const security = [{ session: [] }]
const idParams = z.object({ id: idSchema })
const notFound = { 404: errorResponse('No such list, or no access to it') }

export function listRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      security,
      summary: 'Lists of the signed-in user, in sidebar order',
      description: 'Creates the default list on first use.',
      responses: { 200: jsonResponse(z.array(listSchema), 'Lists'), ...authErrors },
    }),
    (c) => c.json(services.lists.listForUser(requireAuthState(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      security,
      summary: 'Create a list',
      request: { body: jsonBody(createListSchema) },
      responses: {
        201: jsonResponse(listSchema, 'The new list'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => c.json(services.lists.create(requireAuthState(c).user, c.req.valid('json')), 201),
  )

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      security,
      summary: 'Rename, recolor or move a list',
      description:
        'Name, color and icon can be changed by the owner. `placement` moves the list in ' +
        "the caller's own sidebar and is allowed for every member.",
      request: { params: idParams, body: jsonBody(updateListSchema) },
      responses: {
        200: jsonResponse(listSchema, 'The updated list'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.lists.update(
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
      path: '/{id}',
      tags,
      security,
      summary: 'Delete a list and its tasks',
      request: { params: idParams },
      responses: {
        204: noContent,
        409: errorResponse('The default list cannot be deleted'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => {
      services.lists.delete(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{id}/tasks',
      tags,
      security,
      summary: 'Tasks of a list (open and completed), in manual order',
      request: { params: idParams },
      responses: {
        200: jsonResponse(z.array(taskSchema), 'Tasks'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(services.tasks.tasksOfList(requireAuthState(c).user, c.req.valid('param').id), 200),
  )

  router.openapi(
    createRoute({
      method: 'delete',
      path: '/{id}/completed',
      tags,
      security,
      summary: 'Delete all completed tasks of a list',
      request: { params: idParams },
      responses: {
        200: jsonResponse(z.object({ deleted: z.int() }), 'How many tasks were deleted'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        {
          deleted: services.lists.deleteCompleted(
            requireAuthState(c).user,
            c.req.valid('param').id,
          ),
        },
        200,
      ),
  )

  return router
}

export function listGroupRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)
  const groupNotFound = { 404: errorResponse('No such group') }

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags,
      security,
      summary: 'Sidebar groups (folders) of the signed-in user',
      responses: { 200: jsonResponse(z.array(listGroupSchema), 'Groups'), ...authErrors },
    }),
    (c) => c.json(services.lists.groupsForUser(requireAuthState(c).user.id), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      security,
      summary: 'Create a group',
      request: { body: jsonBody(createListGroupSchema) },
      responses: {
        201: jsonResponse(listGroupSchema, 'The new group'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => c.json(services.lists.createGroup(requireAuthState(c).user, c.req.valid('json')), 201),
  )

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      security,
      summary: 'Rename, collapse or move a group',
      request: { params: idParams, body: jsonBody(updateListGroupSchema) },
      responses: {
        200: jsonResponse(listGroupSchema, 'The updated group'),
        ...groupNotFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.lists.updateGroup(
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
      path: '/{id}',
      tags,
      security,
      summary: 'Delete a group',
      description: 'Its lists are kept and move to the top level of the sidebar.',
      request: { params: idParams },
      responses: { 204: noContent, ...groupNotFound, ...authErrors, ...commonErrors },
    }),
    (c) => {
      services.lists.deleteGroup(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  return router
}
