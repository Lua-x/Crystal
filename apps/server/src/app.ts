import { COVER_MAX_BYTES } from '@crystal/shared'
import { OpenAPIHono } from '@hono/zod-openapi'
import { compress } from 'hono/compress'

import type { AppEnv } from './context.js'
import { MB, requestBodyLimits } from './middleware/body-limit.js'
import { csrfProtection } from './middleware/csrf.js'
import { apiNotFound, errorHandler, validationHook } from './middleware/errors.js'
import { apiRateLimit } from './middleware/rate-limit.js'
import { requestContext } from './middleware/request-context.js'
import { securityHeaders } from './middleware/security-headers.js'
import { sessionMiddleware, tokenPolicy } from './middleware/session.js'
import { adminRoutes } from './routes/admin.js'
import { attachmentRoutes, taskAttachmentRoutes } from './routes/attachments.js'
import { authRoutes } from './routes/auth.js'
import { calendarRoutes } from './routes/calendar.js'
import { docsRoutes } from './routes/docs.js'
import { eventRoutes } from './routes/events.js'
import { imageRoutes } from './routes/images.js'
import { inviteRoutes } from './routes/invites.js'
import { listGroupRoutes, listRoutes } from './routes/lists.js'
import { meRoutes } from './routes/me.js'
import { notificationRoutes } from './routes/notifications.js'
import { peopleRoutes } from './routes/people.js'
import { statsRoutes } from './routes/stats.js'
import { systemRoutes } from './routes/system.js'
import { subtaskRoutes, taskRoutes } from './routes/tasks.js'
import { exportRoutes, importRoutes } from './routes/transfer.js'
import { searchRoutes, tagRoutes, viewRoutes } from './routes/views.js'
import { CLIENT_ID_PATTERN, runWithOrigin } from './services/events.js'
import type { Services } from './services/index.js'
import { mountWebApp } from './static.js'

export interface AppOptions {
  /** Directory with the built web app; omitted in development (Vite serves it). */
  staticDir?: string | undefined
  /** How often the event stream sends a keep-alive (shorter in tests). */
  heartbeatMs?: number | undefined
}

export function createApp(services: Services, options: AppOptions = {}) {
  const { config, logger } = services
  const app = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })

  app.use('*', requestContext(config, logger))
  app.use('*', securityHeaders(config))
  app.use('*', compress())
  app.onError(errorHandler(logger))

  app.route('/api', systemRoutes(services))

  const v1 = new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
  v1.use('*', async (c, next) => {
    await next()
    // API responses contain personal data and must not end up in shared caches.
    // (Attachments set `private` caching themselves.)
    if (!c.res.headers.has('Cache-Control')) c.header('Cache-Control', 'no-store')
  })
  v1.use(
    '*',
    requestBodyLimits([
      [/^\/api\/v1\/import$/, 12 * MB],
      // The file plus room for the multipart framing.
      [/^\/api\/v1\/tasks\/[^/]+\/attachments$/, config.attachments.maxBytes + 64 * 1024],
      [/^\/api\/v1\/lists\/[^/]+\/cover$/, COVER_MAX_BYTES + 64 * 1024],
    ]),
  )
  v1.use('*', csrfProtection(config))
  v1.use('*', sessionMiddleware(services))
  v1.use('*', tokenPolicy)
  v1.use('*', apiRateLimit(services.limits.api))
  // Changes are announced to other open apps, but not back to the tab that made them.
  v1.use('*', (c, next) => {
    const client = c.req.header('x-crystal-client')
    return runWithOrigin(client && CLIENT_ID_PATTERN.test(client) ? client : undefined, next)
  })
  v1.route('/auth', authRoutes(services))
  v1.route('/invites', inviteRoutes(services))
  v1.route('/me', meRoutes(services))
  v1.route('/admin', adminRoutes(services))
  v1.route('/lists', listRoutes(services))
  v1.route('/list-groups', listGroupRoutes(services))
  v1.route('/tasks', taskRoutes(services))
  v1.route('/tasks', taskAttachmentRoutes(services))
  v1.route('/attachments', attachmentRoutes(services))
  v1.route('/images', imageRoutes(services))
  v1.route('/subtasks', subtaskRoutes(services))
  v1.route('/views', viewRoutes(services))
  v1.route('/search', searchRoutes(services))
  v1.route('/tags', tagRoutes(services))
  v1.route('/people', peopleRoutes(services))
  v1.route('/notifications', notificationRoutes(services))
  v1.route('/stats', statsRoutes(services))
  v1.route('/export', exportRoutes(services))
  v1.route('/import', importRoutes(services))
  v1.route('/events', eventRoutes(services, options.heartbeatMs))
  app.route('/api/v1', v1)

  app.openAPIRegistry.registerComponent('securitySchemes', 'session', {
    type: 'apiKey',
    in: 'cookie',
    name: 'crystal_session',
    description: 'Session cookie (`__Host-crystal_session` when served over HTTPS).',
  })
  app.openAPIRegistry.registerComponent('securitySchemes', 'token', {
    type: 'http',
    scheme: 'bearer',
    description:
      'A personal API token from **Settings → API** (`crystal_…`). Tokens reach lists, tasks, ' +
      'views, search, tags and people; read-only tokens only `GET`.',
  })
  app.doc31('/api/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Crystal API',
      version: services.version,
      description:
        'Scripts and other apps authenticate with a personal API token: ' +
        '`Authorization: Bearer crystal_…` (create one under **Settings → API**). ' +
        'The web app uses a session cookie; its state-changing requests must send an ' +
        '`Origin` header matching the instance. ' +
        'Errors use the shape `{ "error": { "code", "message", "details" } }`.',
      license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
    },
  })

  app.route('/api/docs', docsRoutes())
  app.route('/api/calendar', calendarRoutes(services))

  app.all('/api/*', apiNotFound)
  if (options.staticDir) mountWebApp(app, options.staticDir)

  return app
}

export type App = ReturnType<typeof createApp>
