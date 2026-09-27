import type { MiddlewareHandler } from 'hono'

import type { AppEnv } from '../context.js'
import { AppError } from '../lib/errors.js'
import type { RateLimiter } from '../lib/rate-limit.js'

/** Consumes one unit for `key` and throws 429 with `Retry-After` when exhausted. */
export function enforceRateLimit(limiter: RateLimiter, key: string): void {
  const result = limiter.consume(key)
  if (!result.allowed) {
    const retryAfter = Math.max(1, Math.ceil(result.retryAfterMs / 1000))
    throw new AppError(
      429,
      'rate_limited',
      undefined,
      { retryAfterSeconds: retryAfter },
      {
        'Retry-After': String(retryAfter),
      },
    )
  }
}

/** Limits requests per signed-in user, or per client address when signed out. */
export function apiRateLimit(limiter: RateLimiter): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    const auth = c.get('auth')
    enforceRateLimit(
      limiter,
      auth ? `user:${auth.user.id}` : `ip:${c.get('clientIp') ?? 'unknown'}`,
    )
    await next()
  }
}
