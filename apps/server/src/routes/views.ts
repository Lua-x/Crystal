import {
  searchQuerySchema,
  smartViewSchema,
  tagSchema,
  tagSummarySchema,
  taskSchema,
  viewCountsSchema,
} from '@crystal/shared'
import { createRoute, z } from '@hono/zod-openapi'

import { requireAuthState } from '../context.js'
import { requireAuth } from '../middleware/session.js'
import type { Services } from '../services/index.js'
import { authErrors, commonErrors, createRouter, jsonResponse } from './openapi.js'

const tags = ['Smart lists']
const security = [{ session: [] }]

export function viewRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/counts',
      tags,
      security,
      summary: 'Number of open tasks per smart list (completed: all completed tasks)',
      responses: { 200: jsonResponse(viewCountsSchema, 'Counts'), ...authErrors },
    }),
    (c) => c.json(services.views.counts(requireAuthState(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/my-day/suggestions',
      tags,
      security,
      summary: 'Suggestions for My Day',
      description: 'Open tasks that are overdue or due soon, then recently added ones.',
      responses: { 200: jsonResponse(z.array(taskSchema), 'Suggested tasks'), ...authErrors },
    }),
    (c) => c.json(services.views.suggestions(requireAuthState(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{view}',
      tags,
      security,
      summary: 'Tasks of a smart list',
      description:
        '`my-day` contains open and completed tasks picked for today; `completed` is limited ' +
        'to the 500 most recent. "Today" is based on the user\'s time zone.',
      request: { params: z.object({ view: smartViewSchema }) },
      responses: {
        200: jsonResponse(z.array(taskSchema), 'Tasks'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) => c.json(services.views.view(requireAuthState(c).user, c.req.valid('param').view), 200),
  )

  return router
}

export function searchRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags: ['Tasks'],
      security,
      summary: 'Search tasks',
      description:
        'Finds tasks whose title, notes, subtasks or tags contain every word (as a prefix). ' +
        'Accents are ignored. Completed tasks are included.',
      request: { query: searchQuerySchema },
      responses: {
        200: jsonResponse(z.array(taskSchema), 'Matching tasks, best match first'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(services.views.searchTasks(requireAuthState(c).user, c.req.valid('query').q), 200),
  )

  return router
}

export function tagRoutes(services: Services) {
  const router = createRouter()
  router.use('*', requireAuth)

  router.openapi(
    createRoute({
      method: 'get',
      path: '/',
      tags: ['Tags'],
      security,
      summary: 'Tags in use',
      description: 'Tags on tasks in the lists you can see, alphabetically.',
      responses: { 200: jsonResponse(z.array(tagSummarySchema), 'Tags'), ...authErrors },
    }),
    (c) => c.json(services.views.tags(requireAuthState(c).user), 200),
  )

  router.openapi(
    createRoute({
      method: 'get',
      path: '/{tag}/tasks',
      tags: ['Tags'],
      security,
      summary: 'Tasks with a tag',
      description: 'Open tasks by due date first, then completed ones.',
      request: { params: z.object({ tag: tagSchema }) },
      responses: {
        200: jsonResponse(z.array(taskSchema), 'Tasks'),
        ...authErrors,
        ...commonErrors,
      },
    }),
    (c) =>
      c.json(services.views.taggedTasks(requireAuthState(c).user, c.req.valid('param').tag), 200),
  )

  return router
}
