import { z } from 'zod'

import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH, REGISTRATION_MODES } from '../constants.js'
import {
  displayNameSchema,
  emailSchema,
  localeSchema,
  passwordSchema,
  roleSchema,
  timezoneSchema,
  usernameSchema,
} from './common.js'

/** Public instance configuration the login screen needs before anyone signs in. */
export const authConfigSchema = z.object({
  /** True until the first account (which becomes admin) has been created. */
  needsSetup: z.boolean(),
  registration: z.enum(REGISTRATION_MODES),
  passwordLogin: z.boolean(),
  oidc: z.object({
    enabled: z.boolean(),
    buttonLabel: z.string(),
  }),
  /** Forgotten passwords can be reset by email (needs SMTP and `BASE_URL`). */
  passwordReset: z.boolean(),
  version: z.string(),
})
export type AuthConfig = z.infer<typeof authConfigSchema>

export const forgotPasswordSchema = z.object({
  /** Username or email address. */
  identifier: z.string().trim().toLowerCase().min(1).max(EMAIL_MAX_LENGTH),
})
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z.object({
  token: z.string().min(1).max(128),
  password: passwordSchema,
})
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>

export const loginSchema = z.object({
  /** Username or email address. */
  identifier: z.string().trim().toLowerCase().min(1).max(EMAIL_MAX_LENGTH),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
})
export type LoginInput = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema,
  email: emailSchema.optional(),
  password: passwordSchema,
  inviteToken: z.string().min(1).max(128).optional(),
  locale: localeSchema.optional(),
  timezone: timezoneSchema.optional(),
})
export type RegisterInput = z.infer<typeof registerSchema>

export const invitePreviewSchema = z.object({
  role: roleSchema,
  invitedBy: z.string(),
  expiresAt: z.iso.datetime().nullable(),
})
export type InvitePreview = z.infer<typeof invitePreviewSchema>
