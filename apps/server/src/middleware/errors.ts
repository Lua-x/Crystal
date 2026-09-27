import type { Hook } from '@hono/zod-openapi'
import type { ErrorHandler, NotFoundHandler } from 'hono'
import { HTTPException } from 'hono/http-exception'

import type { AppEnv } from '../context.js'
import { AppError } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'

export function errorHandler(logger: Logger): ErrorHandler<AppEnv> {
  return (error, c) => {
    if (error instanceof AppError) {
      for (const [name, value] of Object.entries(error.headers ?? {})) c.header(name, value)
      return c.json(error.toBody(), error.status)
    }
    // Raised by Hono itself, e.g. for a malformed JSON body.
    if (error instanceof HTTPException && error.status < 500) {
      const code = error.status === 401 ? 'unauthorized' : 'validation_failed'
      return c.json(
        new AppError(error.status, code, error.message || undefined).toBody(),
        error.status,
      )
    }
    logger.error({ err: error, requestId: c.get('requestId') }, 'Unhandled error')
    return c.json(new AppError(500, 'internal_error').toBody(), 500)
  }
}

export const apiNotFound: NotFoundHandler<AppEnv> = (c) =>
  c.json(new AppError(404, 'not_found').toBody(), 404)

/** Formats Zod validation failures of OpenAPI routes like every other error. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches any route definition
export const validationHook: Hook<any, AppEnv, any, any> = (result, c) => {
  if (result.success) return
  const details = result.error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
  }))
  return c.json(new AppError(400, 'validation_failed', undefined, details).toBody(), 400)
}
