import {
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
export type InviteRow = typeof invites.$inferSelect
export type UserIdentityRow = typeof userIdentities.$inferSelect
export type ListRow = typeof lists.$inferSelect
export type ListMemberRow = typeof listMembers.$inferSelect
export type ListGroupRow = typeof listGroups.$inferSelect
export type TaskRow = typeof tasks.$inferSelect
export type SubtaskRow = typeof subtasks.$inferSelect
export type TaskTagRow = typeof taskTags.$inferSelect
export type NotificationChannelRow = typeof notificationChannels.$inferSelect
export type PushSubscriptionRow = typeof pushSubscriptions.$inferSelect
