import { OpenAPIHono } from '@hono/zod-openapi'
import { compress } from 'hono/compress'

import type { AppEnv } from './context.js'
import { csrfProtection } from './middleware/csrf.js'
import { apiNotFound, errorHandler, validationHook } from './middleware/errors.js'
import { apiRateLimit } from './middleware/rate-limit.js'
import { requestContext } from './middleware/request-context.js'
import { securityHeaders } from './middleware/security-headers.js'
import { sessionMiddleware } from './middleware/session.js'
import { adminRoutes } from './routes/admin.js'
import { authRoutes } from './routes/auth.js'
import { inviteRoutes } from './routes/invites.js'
import { meRoutes } from './routes/me.js'
import { systemRoutes } from './routes/system.js'
import type { Services } from './services/index.js'
import { mountWebApp } from './static.js'

export interface AppOptions {
  /** Directory with the built web app; omitted in development (Vite serves it). */
  staticDir?: string | undefined
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
    c.header('Cache-Control', 'no-store')
  })
  v1.use('*', csrfProtection(config))
  v1.use('*', sessionMiddleware(services))
  v1.use('*', apiRateLimit(services.limits.api))
  v1.route('/auth', authRoutes(services))
  v1.route('/invites', inviteRoutes(services))
  v1.route('/me', meRoutes(services))
  v1.route('/admin', adminRoutes(services))
  app.route('/api/v1', v1)

  app.openAPIRegistry.registerComponent('securitySchemes', 'session', {
    type: 'apiKey',
    in: 'cookie',
    name: 'crystal_session',
    description: 'Session cookie (`__Host-crystal_session` when served over HTTPS).',
  })
  app.doc31('/api/openapi.json', {
    openapi: '3.1.0',
    info: {
      title: 'Crystal API',
      version: services.version,
      description:
        'State-changing requests must send an `Origin` header matching the instance. ' +
        'Errors use the shape `{ "error": { "code", "message", "details" } }`.',
      license: { name: 'AGPL-3.0-only', url: 'https://www.gnu.org/licenses/agpl-3.0.html' },
    },
  })

  app.all('/api/*', apiNotFound)
  if (options.staticDir) mountWebApp(app, options.staticDir)

  return app
}

export type App = ReturnType<typeof createApp>
