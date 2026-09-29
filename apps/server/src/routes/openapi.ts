import { apiErrorSchema } from '@crystal/shared'
import { OpenAPIHono } from '@hono/zod-openapi'
import type { ZodType } from 'zod'

import type { AppEnv } from '../context.js'
import { validationHook } from '../middleware/errors.js'

export function createRouter() {
  return new OpenAPIHono<AppEnv>({ defaultHook: validationHook })
}

export function jsonBody<T extends ZodType>(schema: T) {
  return { content: { 'application/json': { schema } }, required: true } as const
}

export function jsonResponse<T extends ZodType>(schema: T, description: string) {
  return { content: { 'application/json': { schema } }, description } as const
}

export function errorResponse(description: string) {
  return jsonResponse(apiErrorSchema, description)
}

export const noContent = { description: 'Done' } as const

export const commonErrors = {
  400: errorResponse('The request is invalid'),
  429: errorResponse('Too many requests'),
} as const

type SecurityRequirement = Record<string, string[]>

/** Routes a browser session or a personal API token can use. */
export const sessionOrToken: SecurityRequirement[] = [{ session: [] }, { token: [] }]
/** Account and instance settings: browser sessions only. */
export const sessionOnly: SecurityRequirement[] = [{ session: [] }]

export const authErrors = {
  401: errorResponse('Not signed in'),
  403: errorResponse('Not allowed (or the request origin could not be verified)'),
} as const
