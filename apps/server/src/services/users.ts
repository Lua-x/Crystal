import {
  parsePreferences,
  uuidv7,
  type AdminUser,
  type Locale,
  type Me,
  type Person,
  type Preferences,
  type Role,
  type SessionInfo,
} from '@crystal/shared'
import { and, asc, count, eq, isNull, ne } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { userIdentities, users, type SessionRow, type UserRow } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError } from '../lib/errors.js'

export interface NewUser {
  username: string
  displayName: string
  email?: string | null | undefined
  role: Role
  passwordHash: string | null
  locale: Locale
  timezone: string
}

export interface UserPatch {
  username?: string
  displayName?: string
  email?: string | null
  locale?: Locale
  timezone?: string
  preferences?: Partial<Preferences>
  role?: Role
  passwordHash?: string | null
  disabled?: boolean
}

export class UserService {
  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  count(executor: Executor = this.db): number {
    return executor.select({ value: count() }).from(users).get()?.value ?? 0
  }

  findById(id: string, executor: Executor = this.db): UserRow | undefined {
    return executor.select().from(users).where(eq(users.id, id)).get()
  }

  findByUsername(username: string, executor: Executor = this.db): UserRow | undefined {
    return executor.select().from(users).where(eq(users.username, username)).get()
  }

  findByEmail(email: string, executor: Executor = this.db): UserRow | undefined {
    return executor.select().from(users).where(eq(users.email, email)).get()
  }

  /** Looks a user up by username or, if the identifier contains an `@`, by email. */
  findByIdentifier(identifier: string): UserRow | undefined {
    const normalized = identifier.trim().toLowerCase()
    return normalized.includes('@') ? this.findByEmail(normalized) : this.findByUsername(normalized)
  }

  create(executor: Executor, input: NewUser): UserRow {
    this.assertAvailable(executor, input.username, input.email ?? null)
    const now = this.now()
    const row: UserRow = {
      id: uuidv7(now.getTime()),
      username: input.username,
      displayName: input.displayName,
      email: input.email ?? null,
      role: input.role,
      passwordHash: input.passwordHash,
      locale: input.locale,
      timezone: input.timezone,
      preferences: {},
      createdAt: now,
      updatedAt: now,
      lastLoginAt: null,
      disabledAt: null,
      summarySentOn: null,
      steamId: null,
      steamName: null,
    }
    executor.insert(users).values(row).run()
    return row
  }

  update(id: string, patch: UserPatch, executor: Executor = this.db): UserRow {
    const current = this.findById(id, executor)
    if (!current) throw new AppError(404, 'not_found')

    this.assertAvailable(
      executor,
      patch.username !== undefined && patch.username !== current.username ? patch.username : null,
      patch.email !== undefined && patch.email !== current.email ? patch.email : null,
    )

    const changes: Partial<UserRow> = { updatedAt: this.now() }
    if (patch.username !== undefined) changes.username = patch.username
    if (patch.displayName !== undefined) changes.displayName = patch.displayName
    if (patch.email !== undefined) changes.email = patch.email
    if (patch.locale !== undefined) changes.locale = patch.locale
    if (patch.timezone !== undefined) changes.timezone = patch.timezone
    if (patch.role !== undefined) changes.role = patch.role
    if (patch.passwordHash !== undefined) changes.passwordHash = patch.passwordHash
    if (patch.disabled !== undefined) changes.disabledAt = patch.disabled ? this.now() : null
    if (patch.preferences !== undefined) {
      changes.preferences = { ...parsePreferences(current.preferences), ...patch.preferences }
    }

    executor.update(users).set(changes).where(eq(users.id, id)).run()
    return { ...current, ...changes }
  }

  markLogin(id: string, executor: Executor = this.db): void {
    executor.update(users).set({ lastLoginAt: this.now() }).where(eq(users.id, id)).run()
  }

  delete(id: string, executor: Executor = this.db): void {
    executor.delete(users).where(eq(users.id, id)).run()
  }

  /** Suggests a free username based on the given one (`anna`, `anna-2`, …). */
  availableUsername(base: string, executor: Executor = this.db): string {
    if (!this.findByUsername(base, executor)) return base
    for (let suffix = 2; ; suffix++) {
      const candidate = `${base.slice(0, 32 - String(suffix).length - 1)}-${suffix}`
      if (!this.findByUsername(candidate, executor)) return candidate
    }
  }

  toMe(user: UserRow): Me {
    const identities = this.db
      .select()
      .from(userIdentities)
      .where(eq(userIdentities.userId, user.id))
      .all()
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      locale: user.locale,
      timezone: user.timezone,
      preferences: parsePreferences(user.preferences),
      hasPassword: user.passwordHash !== null,
      identities: identities.map((identity) => ({
        provider: identity.provider,
        email: identity.email,
        createdAt: identity.createdAt.toISOString(),
      })),
      createdAt: user.createdAt.toISOString(),
    }
  }

  listForAdmin(): AdminUser[] {
    const linked = new Set(
      this.db
        .select({ userId: userIdentities.userId })
        .from(userIdentities)
        .all()
        .map((row) => row.userId),
    )
    return this.db
      .select()
      .from(users)
      .orderBy(asc(users.displayName))
      .all()
      .map((user) => ({
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        email: user.email,
        role: user.role,
        disabled: user.disabledAt !== null,
        hasPassword: user.passwordHash !== null,
        ssoLinked: linked.has(user.id),
        createdAt: user.createdAt.toISOString(),
        lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      }))
  }

  /**
   * The other active people on this instance, for sharing lists. Only names
   * are shown – email addresses stay private.
   */
  people(userId: string): Person[] {
    return this.db
      .select({ id: users.id, username: users.username, displayName: users.displayName })
      .from(users)
      .where(and(isNull(users.disabledAt), ne(users.id, userId)))
      .orderBy(asc(users.displayName))
      .all()
  }

  /** Throws if the username or email belongs to another account. `null` skips a check. */
  private assertAvailable(executor: Executor, username: string | null, email: string | null) {
    if (username && this.findByUsername(username, executor)) {
      throw new AppError(409, 'username_taken')
    }
    if (email && this.findByEmail(email, executor)) {
      throw new AppError(409, 'email_taken')
    }
  }

  /** Whether another active admin exists besides the given user. */
  hasOtherActiveAdmin(userId: string, executor: Executor = this.db): boolean {
    const other = executor
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.role, 'admin'), isNull(users.disabledAt), ne(users.id, userId)))
      .get()
    return other !== undefined
  }
}

export function toSessionInfo(session: SessionRow, currentSessionId: string): SessionInfo {
  return {
    id: session.id,
    current: session.id === currentSessionId,
    userAgent: session.userAgent,
    ipAddress: session.ipAddress,
    createdAt: session.createdAt.toISOString(),
    lastSeenAt: session.lastSeenAt.toISOString(),
    expiresAt: session.expiresAt.toISOString(),
  }
}
