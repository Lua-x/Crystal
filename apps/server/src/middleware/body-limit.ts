import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { AppEnv } from '../context.js'
import { AppError } from '../lib/errors.js'

const MB = 1024 * 1024

const tooLarge = (): never => {
  throw new AppError(413, 'payload_too_large')
}

/**
 * Caps request bodies so nobody can make the server buffer arbitrary amounts
 * of data. JSON requests are small; imports and uploads get more room.
 */
export function requestBodyLimits(larger: Record<string, number>): MiddlewareHandler<AppEnv> {
  const standard = bodyLimit({ maxSize: MB, onError: tooLarge })
  const special = Object.entries(larger).map(
    ([path, maxSize]) => [path, bodyLimit({ maxSize, onError: tooLarge })] as const,
  )
  return (c, next) => {
    const match = special.find(([path]) => c.req.path === path || c.req.path.startsWith(`${path}/`))
    return (match?.[1] ?? standard)(c, next)
  }
}

export { MB }
