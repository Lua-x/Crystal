import {
  createSubtaskSchema,
  createTaskSchema,
  idSchema,
  taskSchema,
  updateSubtaskSchema,
  updateTaskSchema,
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

const tags = ['Tasks']
const security = [{ session: [] }]
const idParams = z.object({ id: idSchema })
const notFound = { 404: errorResponse('No such task, or no access to it') }

export function taskRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'post',
      path: '/',
      tags,
      security,
      summary: 'Create a task',
      description: 'Without `listId`, the task goes to the default list. New tasks go to the top.',
      request: { body: jsonBody(createTaskSchema) },
      responses: {
        201: jsonResponse(taskSchema, 'The new task'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => c.json(services.tasks.create(requireAuthState(c).user, c.req.valid('json')), 201),
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{id}',
      tags,
      security,
      summary: 'A task with its subtasks',
      request: { params: idParams },
      responses: {
        200: jsonResponse(taskSchema, 'The task'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => c.json(services.tasks.get(requireAuthState(c).user, c.req.valid('param').id), 200),
  )

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      security,
      summary: 'Update, complete, move or add a task to My Day',
      description:
        'Removing the due date also removes the due time. `placement` moves the task within ' +
        'its list or to another list. `myDay` only affects the signed-in user.',
      request: { params: idParams, body: jsonBody(updateTaskSchema) },
      responses: {
        200: jsonResponse(taskSchema, 'The updated task'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.tasks.update(
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
      summary: 'Delete a task',
      description: 'It can be restored for 30 days.',
      request: { params: idParams },
      responses: { 204: noContent, ...notFound, ...authErrors, ...commonErrors },
    }),
    (c) => {
      services.tasks.delete(requireAuthState(c).user, c.req.valid('param').id)
      return c.body(null, 204)
    },
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/restore',
      tags,
      security,
      summary: 'Restore a deleted task',
      request: { params: idParams },
      responses: {
        200: jsonResponse(taskSchema, 'The restored task'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => c.json(services.tasks.restore(requireAuthState(c).user, c.req.valid('param').id), 200),
  )

  router.openapi(
    createRoute({
      method: 'post',
      path: '/{id}/subtasks',
      tags,
      security,
      summary: 'Add a subtask (at the end)',
      request: { params: idParams, body: jsonBody(createSubtaskSchema) },
      responses: {
        201: jsonResponse(taskSchema, 'The task with the new subtask'),
        ...notFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.tasks.addSubtask(
          requireAuthState(c).user,
          c.req.valid('param').id,
          c.req.valid('json'),
        ),
        201,
      ),
  )

  return router
}

export function subtaskRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)
  const subtaskNotFound = { 404: errorResponse('No such subtask, or no access to it') }

  router.openapi(
    createRoute({
      method: 'patch',
      path: '/{id}',
      tags,
      security,
      summary: 'Rename, complete or move a subtask',
      request: { params: idParams, body: jsonBody(updateSubtaskSchema) },
      responses: {
        200: jsonResponse(taskSchema, 'The parent task'),
        ...subtaskNotFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(
        services.tasks.updateSubtask(
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
      summary: 'Delete a subtask',
      request: { params: idParams },
      responses: {
        200: jsonResponse(taskSchema, 'The parent task'),
        ...subtaskNotFound,
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(services.tasks.deleteSubtask(requireAuthState(c).user, c.req.valid('param').id), 200),
  )

  return router
}
