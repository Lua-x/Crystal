export const APP_NAME = 'Crystal'

export const SUPPORTED_LOCALES = ['de', 'en'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'en'

export const ROLES = ['admin', 'user'] as const
export type Role = (typeof ROLES)[number]

/** How new accounts may be created once the first (admin) account exists. */
export const REGISTRATION_MODES = ['open', 'invite', 'closed'] as const
export type RegistrationMode = (typeof REGISTRATION_MODES)[number]

/**
 * What an instance is for, chosen once when the first account is created:
 * everyday lists and tasks, or games with goals and achievements.
 */
export const INSTANCE_MODES = ['standard', 'gaming'] as const
export type InstanceMode = (typeof INSTANCE_MODES)[number]

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

/** Colors a list can have; rendered through the `--color-list-*` design tokens. */
export const LIST_COLORS = [
  'red',
  'orange',
  'yellow',
  'green',
  'mint',
  'teal',
  'blue',
  'indigo',
  'purple',
  'pink',
  'brown',
  'gray',
] as const
export type ListColor = (typeof LIST_COLORS)[number]

/** Access to a list. Owners manage the list itself, editors change its tasks. */
export const LIST_ROLES = ['owner', 'editor', 'viewer'] as const
export type ListRole = (typeof LIST_ROLES)[number]

/** Roles a list can be shared with; every list has exactly one owner. */
export const SHARE_ROLES = ['editor', 'viewer'] as const
export type ShareRole = (typeof SHARE_ROLES)[number]

/** Automatic lists computed from all lists a user can see. */
export const SMART_VIEWS = [
  'my-day',
  'important',
  'planned',
  'overdue',
  'assigned',
  'all',
  'completed',
] as const
export type SmartView = (typeof SMART_VIEWS)[number]

/** 0 = none, 1 = low, 2 = medium, 3 = high. */
export const PRIORITIES = [0, 1, 2, 3] as const
export type Priority = (typeof PRIORITIES)[number]

export const RECURRENCE_FREQUENCIES = ['daily', 'weekly', 'monthly', 'yearly'] as const
export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number]

/** Whether the next occurrence is counted from the due date or from the day of completion. */
export const RECURRENCE_BASES = ['due', 'completion'] as const
export type RecurrenceBase = (typeof RECURRENCE_BASES)[number]

export const RECURRENCE_MAX_INTERVAL = 999

export const TAG_MAX_LENGTH = 40
export const TAGS_PER_TASK_MAX = 20

/** What a personal API token may do: only read, or also change data. */
export const API_TOKEN_SCOPES = ['read', 'write'] as const
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]
/** Every token starts with this, so secret scanners and people recognize it. */
export const API_TOKEN_PREFIX = 'crystal_'
export const API_TOKEN_NAME_MAX_LENGTH = 60
export const API_TOKEN_MAX_DAYS = 365
export const API_TOKENS_PER_USER_MAX = 25

/**
 * Files that can be attached to tasks, recognized by their content (not their
 * name): common image formats and PDF.
 */
export const ATTACHMENT_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/heic',
  'application/pdf',
] as const
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number]
/** Images browsers can show; HEIC photos from iPhones are offered as downloads. */
export const PREVIEWABLE_IMAGE_TYPES: readonly AttachmentType[] = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
]
export const ATTACHMENTS_PER_TASK_MAX = 20
export const ATTACHMENT_NAME_MAX_LENGTH = 200

/** Images Crystal stores for lists, such as a game's cover. */
export const IMAGE_KINDS = ['cover'] as const
export type ImageKind = (typeof IMAGE_KINDS)[number]
/** Image formats every current browser can show. */
export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
] as const satisfies readonly AttachmentType[]
export type ImageType = (typeof IMAGE_TYPES)[number]
export const COVER_MAX_BYTES = 5 * 1024 * 1024

export const LIST_NAME_MAX_LENGTH = 100
export const LIST_ICON_MAX_LENGTH = 16
export const GROUP_NAME_MAX_LENGTH = 100
export const TASK_TITLE_MAX_LENGTH = 500
export const TASK_NOTES_MAX_LENGTH = 20_000
export const SUBTASK_TITLE_MAX_LENGTH = 500
export const SEARCH_QUERY_MAX_LENGTH = 200
