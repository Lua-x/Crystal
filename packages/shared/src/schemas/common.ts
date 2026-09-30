import { z } from 'zod'

import {
  ACCENT_PRESETS,
  DISPLAY_NAME_MAX_LENGTH,
  EMAIL_MAX_LENGTH,
  INSTANCE_MODES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  ROLES,
  SUPPORTED_LOCALES,
  THEMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
} from '../constants.js'
import { isValidTimeZone } from '../timezone.js'

/*
 * Custom messages are translation keys (`validation.*`). The web app translates
 * them; built-in Zod messages are localized there through a global error map.
 */

export const idSchema = z.uuid()
export const timestampSchema = z.iso.datetime()

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(USERNAME_MIN_LENGTH)
  .max(USERNAME_MAX_LENGTH)
  .regex(/^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/, { error: 'validation.username_format' })

export const displayNameSchema = z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH)

// Normalize first, then validate: `z.email()` alone would reject surrounding spaces.
export const emailSchema = z.string().trim().toLowerCase().max(EMAIL_MAX_LENGTH).check(z.email())

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH)

export const roleSchema = z.enum(ROLES)
export const instanceModeSchema = z.enum(INSTANCE_MODES)
export const localeSchema = z.enum(SUPPORTED_LOCALES)
export const themeSchema = z.enum(THEMES)

export const timezoneSchema = z
  .string()
  .max(64)
  .refine(isValidTimeZone, { error: 'validation.timezone_invalid' })

/** Either a named preset or a custom color in `#rrggbb` notation. */
export const accentColorSchema = z.union([
  z.enum(ACCENT_PRESETS),
  z
    .string()
    .regex(/^#[0-9a-f]{6}$/i, { error: 'validation.color_invalid' })
    .toLowerCase(),
])
