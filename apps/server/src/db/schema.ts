import { ROLES, SUPPORTED_LOCALES } from '@crystal/shared'
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

/*
 * Conventions:
 * - IDs are UUIDv7 strings, generated in application code.
 * - Timestamps are stored as integer milliseconds since the epoch (UTC).
 * - Secrets (session tokens, invite tokens) are only ever stored as SHA-256 hashes.
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

export type UserRow = typeof users.$inferSelect
export type SessionRow = typeof sessions.$inferSelect
export type InviteRow = typeof invites.$inferSelect
export type UserIdentityRow = typeof userIdentities.$inferSelect
