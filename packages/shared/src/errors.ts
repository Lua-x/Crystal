import { z } from 'zod'

/**
 * Machine-readable error codes returned by the API. The web app translates them;
 * API clients can rely on them staying stable.
 */
export const ERROR_CODES = [
  'validation_failed',
  'unauthorized',
  'forbidden',
  'not_found',
  'rate_limited',
  'csrf_failed',
  'internal_error',
  'invalid_credentials',
  'account_disabled',
  'password_login_disabled',
  'registration_closed',
  'invite_invalid',
  'username_taken',
  'email_taken',
  'wrong_password',
  'last_admin',
  'cannot_modify_self',
  'oidc_not_configured',
  'oidc_failed',
  'oidc_already_linked',
  'oidc_account_not_found',
  'identity_required',
  'list_is_default',
  'already_member',
  'owner_cannot_leave',
  'not_a_member',
] as const

export type ErrorCode = (typeof ERROR_CODES)[number]

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
})

export type ApiErrorBody = z.infer<typeof apiErrorSchema>
