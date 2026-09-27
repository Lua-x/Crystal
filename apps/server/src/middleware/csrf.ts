import type { MiddlewareHandler } from 'hono'

import type { Config } from '../config.js'
import type { AppEnv } from '../context.js'
import { AppError } from '../lib/errors.js'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * Rejects state-changing requests that do not come from Crystal's own origin.
 * Browsers always send `Origin` with such requests, so a missing or foreign
 * origin means a cross-site request. Together with `SameSite=Lax` session
 * cookies this blocks CSRF, including login CSRF.
 */
export function csrfProtection(config: Config): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    if (SAFE_METHODS.has(c.req.method)) return next()

    const origin = c.req.header('origin')
    if (origin && isAllowedOrigin(origin, c.req.header.bind(c.req), config)) return next()
    if (!origin && c.req.header('sec-fetch-site') === 'same-origin') return next()

    throw new AppError(403, 'csrf_failed')
  }
}

function isAllowedOrigin(
  origin: string,
  header: (name: string) => string | undefined,
  config: Config,
): boolean {
  let parsed: URL
  try {
    parsed = new URL(origin)
  } catch {
    return false
  }
  if (config.baseUrl) return parsed.origin === config.baseUrl.origin

  // Without BASE_URL, compare against the host the browser addressed.
  const forwardedHost =
    config.trustProxyHops > 0 ? header('x-forwarded-host')?.split(',')[0]?.trim() : undefined
  const host = forwardedHost ?? header('host')
  return host !== undefined && parsed.host === host.toLowerCase()
}
