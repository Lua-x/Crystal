import {
  API_TOKEN_SCOPES,
  ATTACHMENT_TYPES,
  IMAGE_KINDS,
  IMAGE_TYPES,
  INSTANCE_MODES,
  LIST_COLORS,
  LIST_ROLES,
  NOTIFICATION_CHANNEL_TYPES,
  ROLES,
  SUPPORTED_LOCALES,
  type Recurrence,
} from '@crystal/shared'
import { sql } from 'drizzle-orm'
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

/*
 * Conventions:
 * - IDs are UUIDv7 strings, generated in application code.
 * - Timestamps are stored as integer milliseconds since the epoch (UTC).
 * - Secrets (session tokens, invite tokens) are only ever stored as SHA-256 hashes.
 * - Manual order uses fractional index keys (`position`), compared bytewise.
 * - Lists and tasks are deleted softly first (`deleted_at`), so offline clients can
 *   learn about deletions; a cleanup job removes them for good later.
 */

const timestamp = (name: string) => integer(name, { mode: 'timestamp_ms' })

/**
 * Settings of the instance as a whole, in a single row (`id = 1`). The row is
 * written together with the first account; until then the instance is new.
 */
export const instance = sqliteTable('instance', {
  id: integer('id').primaryKey(),
  /** Chosen once during setup and never changed afterwards. */
  mode: text('mode', { enum: INSTANCE_MODES }).notNull(),
  createdAt: timestamp('created_at').notNull(),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  /** Lowercase login name. */
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  /** Optional and lowercase; several users may have none. */
  email: text('email').unique(),
  role: text('role', { enum: ROLES }).notNull().default('user'),
  /** Argon2id hash; `null` for accounts that only sign in through OIDC. */
  passwordHash: text('password_hash'),
  locale: text('locale', { enum: SUPPORTED_LOCALES }).notNull().default('en'),
  timezone: text('timezone').notNull().default('UTC'),
  /** UI preferences as JSON; read through `parsePreferences`. */
  preferences: text('preferences', { mode: 'json' }).$type<unknown>().notNull().default({}),
  createdAt: timestamp('created_at').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
  lastLoginAt: timestamp('last_login_at'),
  disabledAt: timestamp('disabled_at'),
  /** The local day (`YYYY-MM-DD`) the last daily summary was sent for. */
  summarySentOn: text('summary_sent_on'),
  /** The linked Steam account (SteamID64) and its name when it was linked. */
  steamId: text('steam_id'),
  steamName: text('steam_name'),
})

export const userIdentities = sqliteTable(
  'user_identities',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['oidc'] }).notNull(),
    issuer: text('issuer').notNull(),
    subject: text('subject').notNull(),
    email: text('email'),
    createdAt: timestamp('created_at').notNull(),
    lastUsedAt: timestamp('last_used_at'),
  },
  (table) => [
    uniqueIndex('user_identities_issuer_subject_idx').on(table.issuer, table.subject),
    uniqueIndex('user_identities_user_issuer_idx').on(table.userId, table.issuer),
  ],
)

export const sessions = sqliteTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    createdAt: timestamp('created_at').notNull(),
    lastSeenAt: timestamp('last_seen_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
  },
  (table) => [
    index('sessions_user_id_idx').on(table.userId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
)

export const invites = sqliteTable('invites', {
  id: text('id').primaryKey(),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role', { enum: ROLES }).notNull().default('user'),
  note: text('note'),
  maxUses: integer('max_uses').notNull().default(1),
  uses: integer('uses').notNull().default(0),
  expiresAt: timestamp('expires_at'),
  revokedAt: timestamp('revoked_at'),
  createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').notNull(),
})

/** Personal access tokens for the API (`Authorization: Bearer crystal_…`). */
export const apiTokens = sqliteTable(
  'api_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    /** The first characters of the token, shown so people can tell tokens apart. */
    hint: text('hint').notNull(),
    scope: text('scope', { enum: API_TOKEN_SCOPES }).notNull(),
    createdAt: timestamp('created_at').notNull(),
    lastUsedAt: timestamp('last_used_at'),
    expiresAt: timestamp('expires_at'),
  },
  (table) => [index('api_tokens_user_idx').on(table.userId)],
)

/**
 * A person's private calendar feed (iCal). The token is kept sealed so the
 * link can be shown again; lookups use its hash.
 */
export const calendarFeeds = sqliteTable('calendar_feeds', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  token: text('token').notNull(),
  createdAt: timestamp('created_at').notNull(),
  lastUsedAt: timestamp('last_used_at'),
})

/* ── Lists and tasks ─────────────────────────────────────────── */

export const lists = sqliteTable(
  'lists',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    color: text('color', { enum: LIST_COLORS }).notNull().default('blue'),
    /** An emoji shown instead of the default icon. */
    icon: text('icon'),
    /** The creator's default list ("Tasks"). Exactly one per user; cannot be deleted. */
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
    /** An image of this list (`images.id`), e.g. a game's cover. */
    coverImageId: text('cover_image_id'),
    /** Calendar day `YYYY-MM-DD` the list should be finished by. */
    deadline: text('deadline'),
    /** The Steam game whose achievements the list tracks, for its owner's Steam account. */
    steamAppId: integer('steam_app_id'),
    steamSyncedAt: timestamp('steam_synced_at'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    uniqueIndex('lists_default_per_user_idx')
      .on(table.createdBy)
      .where(sql`${table.isDefault} = 1`),
  ],
)

/**
 * Who can access a list, and where it sits in that person's sidebar. Every list
 * has exactly one owner row; sharing (later) adds editor and viewer rows.
 */
export const listMembers = sqliteTable(
  'list_members',
  {
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: LIST_ROLES }).notNull(),
    groupId: text('group_id').references(() => listGroups.id, { onDelete: 'set null' }),
    position: text('position').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.userId] }),
    index('list_members_user_idx').on(table.userId),
  ],
)

/** Folders in one user's sidebar. */
export const listGroups = sqliteTable(
  'list_groups',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: text('position').notNull(),
    collapsed: integer('collapsed', { mode: 'boolean' }).notNull().default(false),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('list_groups_user_idx').on(table.userId)],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    notes: text('notes').notNull().default(''),
    /** Calendar day `YYYY-MM-DD` in the user's time zone (floating, no instant). */
    dueDate: text('due_date'),
    /** `HH:MM`; only set together with a due date. */
    dueTime: text('due_time'),
    important: integer('important', { mode: 'boolean' }).notNull().default(false),
    priority: integer('priority').notNull().default(0),
    position: text('position').notNull(),
    /** Repeat rule; only the open task of a series carries it. */
    recurrence: text('recurrence', { mode: 'json' }).$type<Recurrence>(),
    /** The due date the series started with, so monthly series keep their day. */
    recurrenceAnchor: text('recurrence_anchor'),
    /** The next occurrence created when this task was completed. */
    nextTaskId: text('next_task_id').references((): AnySQLiteColumn => tasks.id, {
      onDelete: 'set null',
    }),
    /** Who takes care of the task; always a member of its list. */
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    /** When to remind; an instant, independent of the floating due date. */
    remindAt: timestamp('remind_at'),
    /** Set once the reminder went out, so it is sent only once. */
    remindedAt: timestamp('reminded_at'),
    /** Who set the reminder; reminded when nobody is assigned. */
    reminderBy: text('reminder_by').references(() => users.id, { onDelete: 'set null' }),
    completedAt: timestamp('completed_at'),
    completedBy: text('completed_by').references(() => users.id, { onDelete: 'set null' }),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  (table) => [
    index('tasks_list_position_idx').on(table.listId, table.position),
    index('tasks_due_date_idx').on(table.dueDate),
    index('tasks_completed_at_idx').on(table.completedAt),
    index('tasks_assignee_idx').on(table.assigneeId),
    index('tasks_pending_reminder_idx')
      .on(table.remindAt)
      .where(sql`${table.remindedAt} IS NULL`),
  ],
)

/** Tags, stored in lower case without `#`. */
export const taskTags = sqliteTable(
  'task_tags',
  {
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.taskId, table.tag] }),
    index('task_tags_tag_idx').on(table.tag),
  ],
)

export const subtasks = sqliteTable(
  'subtasks',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    position: text('position').notNull(),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('subtasks_task_position_idx').on(table.taskId, table.position)],
)

/**
 * Files attached to tasks. The content lives in `DATA_DIR/attachments/<id>`;
 * the name the uploader chose is only ever used for display and downloads.
 */
export const attachments = sqliteTable(
  'attachments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    fileName: text('file_name').notNull(),
    /** Detected from the content, never taken from the upload. */
    mimeType: text('mime_type', { enum: ATTACHMENT_TYPES }).notNull(),
    size: integer('size').notNull(),
    uploadedBy: text('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('attachments_task_idx').on(table.taskId)],
)

/**
 * Pictures that belong to a list, such as a game's cover. The content lives in
 * `DATA_DIR/images/<id>`; everyone with access to the list can see them.
 */
export const images = sqliteTable(
  'images',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: IMAGE_KINDS }).notNull(),
    /** Detected from the content, never taken from the upload. */
    mimeType: text('mime_type', { enum: IMAGE_TYPES }).notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('images_list_idx').on(table.listId)],
)

/** Pictures of a game's world; goals can be pinned to places on them. */
export const maps = sqliteTable(
  'maps',
  {
    id: text('id').primaryKey(),
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    imageId: text('image_id')
      .notNull()
      .references(() => images.id, { onDelete: 'cascade' }),
    /** In pixels, when the picture's header told; the app measures it otherwise. */
    width: integer('width'),
    height: integer('height'),
    position: text('position').notNull(),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('maps_list_position_idx').on(table.listId, table.position)],
)

/** Where a goal is on a map: `x` and `y` from 0 to 1, so they fit any zoom. */
export const mapPins = sqliteTable(
  'map_pins',
  {
    taskId: text('task_id')
      .primaryKey()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    mapId: text('map_id')
      .notNull()
      .references(() => maps.id, { onDelete: 'cascade' }),
    x: real('x').notNull(),
    y: real('y').notNull(),
  },
  (table) => [index('map_pins_map_idx').on(table.mapId)],
)

/**
 * The Steam achievements of a game and the goals they became. A goal deleted by
 * someone leaves its row without a task, so syncing does not bring it back.
 */
export const achievements = sqliteTable(
  'achievements',
  {
    listId: text('list_id')
      .notNull()
      .references(() => lists.id, { onDelete: 'cascade' }),
    /** Steam's name for the achievement, stable across languages. */
    apiName: text('api_name').notNull(),
    taskId: text('task_id').references(() => tasks.id, { onDelete: 'set null' }),
    iconImageId: text('icon_image_id').references(() => images.id, { onDelete: 'set null' }),
    /** Share of all players who unlocked it, 0–100. */
    percent: real('percent'),
    hidden: integer('hidden', { mode: 'boolean' }).notNull().default(false),
  },
  (table) => [
    primaryKey({ columns: [table.listId, table.apiName] }),
    uniqueIndex('achievements_task_idx').on(table.taskId),
  ],
)

/** Tasks a user picked for a day. Entries for past days are simply ignored. */
export const myDay = sqliteTable(
  'my_day',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    addedAt: timestamp('added_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.taskId] }),
    index('my_day_user_date_idx').on(table.userId, table.date),
  ],
)

/* ── Notifications ───────────────────────────────────────────── */

/**
 * Services a user gets notifications on (ntfy, Gotify, Apprise, email). The
 * configuration may hold access tokens, so it is stored encrypted (`seal`).
 */
export const notificationChannels = sqliteTable(
  'notification_channels',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type', { enum: NOTIFICATION_CHANNEL_TYPES }).notNull(),
    name: text('name').notNull(),
    /** Sealed JSON with the type's settings. */
    config: text('config').notNull(),
    /** A display string without secrets, e.g. `ntfy.sh/crystal-anna`. */
    target: text('target').notNull(),
    enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
    lastSentAt: timestamp('last_sent_at'),
    lastError: text('last_error'),
    createdAt: timestamp('created_at').notNull(),
    updatedAt: timestamp('updated_at').notNull(),
  },
  (table) => [index('notification_channels_user_idx').on(table.userId)],
)

/** Browsers that receive Web Push notifications. */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').notNull(),
  },
  (table) => [index('push_subscriptions_user_idx').on(table.userId)],
)

/** Single-use links to set a new password, sent by email. */
export const passwordResets = sqliteTable(
  'password_resets',
  {
    id: text('id').primaryKey(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
  },
  (table) => [index('password_resets_user_idx').on(table.userId)],
)

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type ApiTokenRow = typeof apiTokens.$inferSelect
export type InviteRow = typeof invites.$inferSelect
export type UserIdentityRow = typeof userIdentities.$inferSelect
export type ListRow = typeof lists.$inferSelect
export type ListMemberRow = typeof listMembers.$inferSelect
export type ListGroupRow = typeof listGroups.$inferSelect
export type TaskRow = typeof tasks.$inferSelect
export type SubtaskRow = typeof subtasks.$inferSelect
export type TaskTagRow = typeof taskTags.$inferSelect
export type AttachmentRow = typeof attachments.$inferSelect
export type ImageRow = typeof images.$inferSelect
export type AchievementRow = typeof achievements.$inferSelect
export type MapRow = typeof maps.$inferSelect
export type NotificationChannelRow = typeof notificationChannels.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
