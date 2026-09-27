export const APP_NAME = 'Crystal'

export const SUPPORTED_LOCALES = ['de', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export const ROLES = ['admin', 'user'] as const
export type Role = (typeof ROLES)[number]

/** How new accounts may be created once the first (admin) account exists. */
export const REGISTRATION_MODES = ['open', 'invite', 'closed'] as const
export type RegistrationMode = (typeof REGISTRATION_MODES)[number]

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** Named accent colors, modelled after the macOS accent color choices. */
export const ACCENT_PRESETS = [
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'graphite',
] as const
export type AccentPreset = (typeof ACCENT_PRESETS)[number]

export const USERNAME_MIN_LENGTH = 3
export const USERNAME_MAX_LENGTH = 32
export const DISPLAY_NAME_MAX_LENGTH = 64
export const EMAIL_MAX_LENGTH = 254
export const PASSWORD_MIN_LENGTH = 8
/** Generous upper bound; protects the hasher from multi-megabyte inputs. */
export const PASSWORD_MAX_LENGTH = 256

export const INVITE_MAX_USES = 100
export const INVITE_MAX_DAYS = 90
export const INVITE_NOTE_MAX_LENGTH = 100
