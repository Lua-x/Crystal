import type { MiddlewareHandler } from 'hono'
import { bodyLimit } from 'hono/body-limit'

import type { AppEnv } from '../context.js'
import { AppError } from '../lib/errors.js'

export const MB = 1024 * 1024

const tooLarge = (): never => {
  throw new AppError(413, 'payload_too_large')
}

/**
 * Caps request bodies so nobody can make the server buffer arbitrary amounts
 * of data. JSON requests are small; the paths in `larger` (imports, uploads)
 * get the room given there.
 */
export function requestBodyLimits(
  larger: ReadonlyArray<readonly [RegExp, number]>,
): MiddlewareHandler<AppEnv> {
  const standard = bodyLimit({ maxSize: MB, onError: tooLarge })
  const special = larger.map(
    ([path, maxSize]) => [path, bodyLimit({ maxSize, onError: tooLarge })] as const,
  )
  return (c, next) => {
    const match = special.find(([path]) => path.test(c.req.path))
    return (match?.[1] ?? standard)(c, next)
  }
}
