import { z } from 'zod'

import { PASSWORD_MAX_LENGTH } from '../constants.js'
import {
  accentColorSchema,
  displayNameSchema,
  emailSchema,
  idSchema,
  localeSchema,
  passwordSchema,
  roleSchema,
  themeSchema,
  timestampSchema,
  timezoneSchema,
  usernameSchema,
} from './common.js'

export const preferencesSchema = z.object({
  theme: themeSchema,
  accentColor: accentColorSchema,
  /** Recognize dates, repeats, tags and more while typing a new task. */
  smartEntry: z.boolean(),
})
export type Preferences = z.infer<typeof preferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  accentColor: 'blue',
  smartEntry: true,
}

/**
 * Reads stored preferences leniently: unknown keys are dropped and invalid or
 * missing values fall back to their defaults, so an old or hand-edited value
 * never breaks the app.
 */
export function parsePreferences(raw: unknown): Preferences {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const theme = themeSchema.safeParse(source.theme)
  const accentColor = accentColorSchema.safeParse(source.accentColor)
  return {
    theme: theme.success ? theme.data : DEFAULT_PREFERENCES.theme,
    accentColor: accentColor.success ? accentColor.data : DEFAULT_PREFERENCES.accentColor,
    smartEntry:
      typeof source.smartEntry === 'boolean' ? source.smartEntry : DEFAULT_PREFERENCES.smartEntry,
  }
}

export const linkedIdentitySchema = z.object({
  provider: z.literal('oidc'),
  email: z.string().nullable(),
  createdAt: timestampSchema,
})

/** The signed-in user as returned by `GET /api/v1/me`. */
export const meSchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
  email: z.string().nullable(),
  role: roleSchema,
  locale: localeSchema,
  timezone: z.string(),
  preferences: preferencesSchema,
  hasPassword: z.boolean(),
  identities: z.array(linkedIdentitySchema),
  createdAt: timestampSchema,
})
export type Me = z.infer<typeof meSchema>

/** Fields are optional; `email: null` removes the address. */
export const updateMeSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    email: emailSchema.nullable(),
    locale: localeSchema,
    timezone: timezoneSchema,
    preferences: preferencesSchema.partial(),
  })
  .partial()
export type UpdateMeInput = z.infer<typeof updateMeSchema>

export const changePasswordSchema = z.object({
  /** Required when the account already has a password (not for SSO-only accounts). */
  currentPassword: z.string().max(PASSWORD_MAX_LENGTH).optional(),
  newPassword: passwordSchema,
})
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const sessionInfoSchema = z.object({
  id: idSchema,
  current: z.boolean(),
  userAgent: z.string().nullable(),
  ipAddress: z.string().nullable(),
  createdAt: timestampSchema,
  lastSeenAt: timestampSchema,
  expiresAt: timestampSchema,
})
export type SessionInfo = z.infer<typeof sessionInfoSchema>
