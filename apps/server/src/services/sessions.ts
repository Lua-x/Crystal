import { uuidv7 } from '@crystal/shared'
import { and, desc, eq, gt, lt, ne } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { sessions, users, type SessionRow, type UserRow } from '../db/schema.js'
import { randomToken, sha256 } from '../lib/crypto.js'

const DAY_MS = 24 * 60 * 60 * 1000
/** `last_seen_at` is only written this often to avoid a write on every request. */
const LAST_SEEN_RESOLUTION_MS = 5 * 60 * 1000

export interface SessionContext {
  userAgent: string | undefined
  ipAddress: string | undefined
}

export interface ValidatedSession {
  session: SessionRow
  user: UserRow
  /** True when the expiry was extended and the cookie must be re-sent. */
  renewed: boolean
}

/**
 * Server-side sessions. The client only holds a random token; the database
 * stores its SHA-256 hash, so a leaked database cannot be used to sign in.
 * Sessions slide: once less than half of the lifetime remains, activity extends it.
 */
export class SessionService {
  private readonly ttlMs: number

  constructor(
    private readonly db: Db,
    ttlDays: number,
    private readonly now: () => Date,
  ) {
    this.ttlMs = ttlDays * DAY_MS
  }

  get maxAgeSeconds(): number {
    return Math.floor(this.ttlMs / 1000)
  }

  create(userId: string, context: SessionContext): { token: string; session: SessionRow } {
    const token = randomToken()
    const now = this.now()
    const session: SessionRow = {
      id: uuidv7(now.getTime()),
      tokenHash: sha256(token),
      userId,
      userAgent: context.userAgent?.slice(0, 512) ?? null,
      ipAddress: context.ipAddress ?? null,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: new Date(now.getTime() + this.ttlMs),
    }
    this.db.insert(sessions).values(session).run()
    return { token, session }
  }

  validate(token: string): ValidatedSession | null {
    const row = this.db
      .select({ session: sessions, user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(eq(sessions.tokenHash, sha256(token)))
      .get()
    if (!row) return null

    const now = this.now()
    if (row.session.expiresAt.getTime() <= now.getTime()) {
      this.db.delete(sessions).where(eq(sessions.id, row.session.id)).run()
      return null
    }
    if (row.user.disabledAt) return null

    const renew = row.session.expiresAt.getTime() - now.getTime() < this.ttlMs / 2
    const touch = now.getTime() - row.session.lastSeenAt.getTime() > LAST_SEEN_RESOLUTION_MS
    if (renew || touch) {
      const update = {
        lastSeenAt: now,
        ...(renew ? { expiresAt: new Date(now.getTime() + this.ttlMs) } : {}),
      }
      this.db.update(sessions).set(update).where(eq(sessions.id, row.session.id)).run()
      Object.assign(row.session, update)
    }

    return { session: row.session, user: row.user, renewed: renew }
  }

  listForUser(userId: string): SessionRow[] {
    return this.db
      .select()
      .from(sessions)
      .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, this.now())))
      .orderBy(desc(sessions.lastSeenAt))
      .all()
  }

  /** Revokes one of the user's sessions. Returns false if it does not exist. */
  revoke(userId: string, sessionId: string): boolean {
    const result = this.db
      .delete(sessions)
      .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
      .run()
    return result.changes > 0
  }

  revokeByToken(token: string): void {
    this.db
      .delete(sessions)
      .where(eq(sessions.tokenHash, sha256(token)))
      .run()
  }

  /** Signs the user out everywhere, optionally keeping one session (the current one). */
  revokeAllForUser(userId: string, exceptSessionId?: string): number {
    const condition = exceptSessionId
      ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
      : eq(sessions.userId, userId)
    return this.db.delete(sessions).where(condition).run().changes
  }

  deleteExpired(): number {
    return this.db.delete(sessions).where(lt(sessions.expiresAt, this.now())).run().changes
  }
}
