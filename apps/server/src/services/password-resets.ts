import { uuidv7, type ForgotPasswordInput, type ResetPasswordInput } from '@crystal/shared'
import { and, count, eq, gt, isNull, lt } from 'drizzle-orm'

import { hashPassword } from '../auth/password.js'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { passwordResets } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { randomToken, sha256 } from '../lib/crypto.js'
import { AppError } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'
import { passwordResetMail } from '../notifications/messages.js'
import type { NotificationService } from './notifications.js'
import type { SessionService } from './sessions.js'
import type { UserService } from './users.js'

const HOUR_MS = 60 * 60 * 1000
const TOKEN_TTL_MS = HOUR_MS
/** Emails per account and hour, so nobody can flood someone's inbox. */
const MAX_EMAILS_PER_HOUR = 3

export interface PasswordResetDeps {
  db: Db
  config: Config
  logger: Logger
  users: UserService
  sessions: SessionService
  notifications: NotificationService
  now: () => Date
}

/** "Forgot password": a single-use link by email that is valid for one hour. */
export class PasswordResetService {
  constructor(private readonly deps: PasswordResetDeps) {}

  /** Needs outgoing email, a public URL for the link, and password sign-in. */
  get available(): boolean {
    const { config, notifications } = this.deps
    return notifications.emailAvailable && config.baseUrl !== undefined && config.passwordLogin
  }

  /**
   * Sends a reset link if the account exists and has an email address. The
   * answer is the same either way, so it does not reveal who has an account.
   */
  request(input: ForgotPasswordInput): void {
    const { db, config, logger, users, notifications, now } = this.deps
    if (!config.passwordLogin) throw new AppError(403, 'password_login_disabled')
    const mailer = notifications.mailer
    if (!this.available || !mailer || !config.baseUrl) {
      throw new AppError(400, 'email_not_configured')
    }

    const user = users.findByIdentifier(input.identifier)
    if (!user?.email || user.disabledAt) return

    const time = now()
    const recent =
      db
        .select({ value: count() })
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.userId, user.id),
            gt(passwordResets.createdAt, new Date(time.getTime() - HOUR_MS)),
          ),
        )
        .get()?.value ?? 0
    if (recent >= MAX_EMAILS_PER_HOUR) {
      logger.warn({ userId: user.id }, 'Too many password reset requests; not sending another')
      return
    }

    const token = randomToken()
    db.insert(passwordResets)
      .values({
        id: uuidv7(time.getTime()),
        tokenHash: sha256(token),
        userId: user.id,
        createdAt: time,
        expiresAt: new Date(time.getTime() + TOKEN_TTL_MS),
      })
      .run()

    const link = new URL(`/reset-password?token=${encodeURIComponent(token)}`, config.baseUrl).href
    const mail = passwordResetMail(user.locale, user, link)
    const to = user.email
    // In the background: waiting for the mail server would reveal that the account exists.
    notifications.dispatch(async () => {
      try {
        await mailer.send({ to, ...mail })
      } catch {
        logger.warn({ userId: user.id }, 'Sending the password reset email failed')
      }
    })
  }

  /** Sets the new password, uses up every open link and signs out all sessions. */
  async reset(input: ResetPasswordInput): Promise<void> {
    const { db, config, users, sessions, now } = this.deps
    if (!config.passwordLogin) throw new AppError(403, 'password_login_disabled')

    const tokenHash = sha256(input.token)
    const valid = (executor: Executor = db) =>
      executor
        .select()
        .from(passwordResets)
        .where(
          and(
            eq(passwordResets.tokenHash, tokenHash),
            isNull(passwordResets.usedAt),
            gt(passwordResets.expiresAt, now()),
          ),
        )
        .get()
    const pending = valid()
    const user = pending ? users.findById(pending.userId) : undefined
    if (!pending || !user || user.disabledAt) throw new AppError(400, 'reset_invalid')

    // Hash outside the transaction: better-sqlite3 transactions must be synchronous.
    const passwordHash = await hashPassword(input.password)
    db.transaction((tx) => {
      // The link may have been used by a parallel request in the meantime.
      if (!valid(tx)) throw new AppError(400, 'reset_invalid')
      tx.update(passwordResets)
        .set({ usedAt: now() })
        .where(and(eq(passwordResets.userId, user.id), isNull(passwordResets.usedAt)))
        .run()
      users.update(user.id, { passwordHash }, tx)
    })
    sessions.revokeAllForUser(user.id)
  }

  /** Removes expired links (used ones stay until then, as they count towards the limit). */
  deleteExpired(): number {
    const { db, now } = this.deps
    return db.delete(passwordResets).where(lt(passwordResets.expiresAt, now())).run().changes
  }
}
