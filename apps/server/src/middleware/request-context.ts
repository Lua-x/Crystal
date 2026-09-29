import { randomUUID } from 'node:crypto'

import { getConnInfo } from '@hono/node-server/conninfo'
import type { MiddlewareHandler } from 'hono'

import type { Config } from '../config.js'
import type { AppEnv } from '../context.js'
import { resolveClientIp } from '../lib/client-ip.js'
import type { Logger } from '../lib/logger.js'

const REQUEST_ID_PATTERN = /^[\w-]{1,64}$/
/** Paths that carry a secret (invite links, calendar feeds) must not end up in logs. */
const SECRET_IN_PATH = /^(\/api\/v1\/invites\/|\/invite\/|\/api\/calendar\/)[^/]+/

export function redactPath(path: string): string {
  return path.replace(SECRET_IN_PATH, '$1[redacted]')
}

/** Assigns a request ID, resolves the client address and logs each request. */
export function requestContext(config: Config, logger: Logger): MiddlewareHandler<AppEnv> {
  return async (c, next) => {
    // Reuse a proxy's request ID for correlation, but only if it is well-formed.
    const incomingId = c.req.header('x-request-id')
    const requestId = incomingId && REQUEST_ID_PATTERN.test(incomingId) ? incomingId : randomUUID()
    c.set('requestId', requestId)
    c.header('X-Request-Id', requestId)

    let socketAddress: string | undefined
    try {
      socketAddress = getConnInfo(c).remote.address
    } catch {
      // Not running behind the Node adapter (e.g. `app.request()` in tests).
    }
    c.set(
      'clientIp',
      resolveClientIp(socketAddress, c.req.header('x-forwarded-for'), config.trustProxyHops),
    )

    const started = performance.now()
    await next()

    const path = c.req.path
    if (path === '/api/health') return
    const entry = {
      requestId,
      method: c.req.method,
      path: redactPath(path),
      status: c.res.status,
      durationMs: Math.round(performance.now() - started),
    }
    if (path.startsWith('/api/')) logger.info(entry, 'request')
    else logger.debug(entry, 'request')
  }
}
