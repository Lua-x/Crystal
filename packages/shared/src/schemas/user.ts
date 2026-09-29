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

const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, { error: 'validation.time_invalid' })

export const preferencesSchema = z.object({
  theme: themeSchema,
  accentColor: accentColorSchema,
  /** Recognize dates, repeats, tags and more while typing a new task. */
  smartEntry: z.boolean(),
  /** Notify when someone else assigns a task to you. */
  notifyAssigned: z.boolean(),
  /** A daily overview of what is due, at `dailySummaryTime` (local time). */
  dailySummary: z.boolean(),
  dailySummaryTime: timeOfDaySchema,
})
export type Preferences = z.infer<typeof preferencesSchema>

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  accentColor: 'blue',
  smartEntry: true,
  notifyAssigned: true,
  dailySummary: false,
  dailySummaryTime: '07:00',
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
  const summaryTime = timeOfDaySchema.safeParse(source.dailySummaryTime)
  const flag = (key: 'smartEntry' | 'notifyAssigned' | 'dailySummary'): boolean => {
    const value = source[key]
    return typeof value === 'boolean' ? value : DEFAULT_PREFERENCES[key]
  }
  return {
    theme: theme.success ? theme.data : DEFAULT_PREFERENCES.theme,
    accentColor: accentColor.success ? accentColor.data : DEFAULT_PREFERENCES.accentColor,
    smartEntry: flag('smartEntry'),
    notifyAssigned: flag('notifyAssigned'),
    dailySummary: flag('dailySummary'),
    dailySummaryTime: summaryTime.success ? summaryTime.data : DEFAULT_PREFERENCES.dailySummaryTime,
  }
}

/** Someone on this instance, as others may see them (for sharing and assigning). */
export const personSchema = z.object({
  id: idSchema,
  username: z.string(),
  displayName: z.string(),
})
export type Person = z.infer<typeof personSchema>

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
