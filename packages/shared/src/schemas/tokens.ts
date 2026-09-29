import { z } from 'zod'

import { API_TOKEN_MAX_DAYS, API_TOKEN_NAME_MAX_LENGTH, API_TOKEN_SCOPES } from '../constants.js'
import { idSchema, timestampSchema } from './common.js'

/** A personal API token as listed; the secret itself is only shown once. */
export const apiTokenSchema = z.object({
  id: idSchema,
  name: z.string(),
  scope: z.enum(API_TOKEN_SCOPES),
  /** The first characters of the token, to recognize it (e.g. `crystal_Xk3f…`). */
  hint: z.string(),
  createdAt: timestampSchema,
  lastUsedAt: timestampSchema.nullable(),
  expiresAt: timestampSchema.nullable(),
})
export type ApiToken = z.infer<typeof apiTokenSchema>

export const createApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(API_TOKEN_NAME_MAX_LENGTH),
  scope: z.enum(API_TOKEN_SCOPES),
  /** `null` for a token that does not expire. */
  expiresInDays: z.int().min(1).max(API_TOKEN_MAX_DAYS).nullable(),
})
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>

/** The answer to creating a token: the only time the secret is returned. */
export const createdApiTokenSchema = apiTokenSchema.extend({ token: z.string() })
export type CreatedApiToken = z.infer<typeof createdApiTokenSchema>
