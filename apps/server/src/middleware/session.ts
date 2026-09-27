import type { MiddlewareHandler } from 'hono'

import { clearSessionCookie, readSessionToken, setSessionCookie } from '../auth/cookies.js'
import type { AppEnv } from '../context.js'
import { AppError } from '../lib/errors.js'
import type { Services } from '../services/index.js'

/** Resolves the session cookie into `c.var.auth` (or leaves it undefined). */
export function sessionMiddleware(services: Services): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const token = readSessionToken(c)
    if (token) {
      const result = services.sessions.validate(token)
      if (result) {
        c.set('auth', { user: result.user, session: result.session })
        if (result.renewed) {
          setSessionCookie(c, services.config, token, services.sessions.maxAgeSeconds)
        }
      } else {
        clearSessionCookie(c, services.config)
      }
    }
    await next()
  }
}

export const requireAuth: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!c.get('auth')) throw new AppError(401, 'unauthorized')
  await next()
}

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  const auth = c.get('auth')
  if (!auth) throw new AppError(401, 'unauthorized')
  if (auth.user.role !== 'admin') throw new AppError(403, 'forbidden')
  await next()
}
