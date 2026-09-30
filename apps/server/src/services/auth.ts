import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  uuidv7,
  type AuthConfig,
  type ChangePasswordInput,
  type Locale,
  type LoginInput,
  type RegisterInput,
  type Role,
} from '@crystal/shared'
import { and, eq } from 'drizzle-orm'

import { hashPassword, simulatePasswordVerification, verifyPassword } from '../auth/password.js'
import type { OidcClaims, OidcResult } from '../auth/oidc.js'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { userIdentities, type UserRow } from '../db/schema.js'
import type { Executor } from '../db/types.js'
import { AppError } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'
import type { InstanceService } from './instance.js'
import type { InviteService } from './invites.js'
import type { PasswordResetService } from './password-resets.js'
import type { SessionService } from './sessions.js'
import type { UserService } from './users.js'

export interface AuthServiceDeps {
  db: Db
  config: Config
  logger: Logger
  users: UserService
  instance: InstanceService
  invites: InviteService
  sessions: SessionService
  passwordResets: PasswordResetService
  now: () => Date
  version: string
}

/** Account creation and sign-in, for both passwords and OIDC. */
export class AuthService {
  constructor(private readonly deps: AuthServiceDeps) {}

  getConfig(): AuthConfig {
    const { config, users, instance, passwordResets, version } = this.deps
    return {
      needsSetup: users.count() === 0,
      mode: instance.mode(),
      registration: config.registration,
      passwordLogin: config.passwordLogin,
      oidc: {
        enabled: config.oidc !== undefined,
        buttonLabel: config.oidc?.buttonLabel ?? '',
      },
      passwordReset: passwordResets.available,
      version,
    }
  }

  /**
   * Creates an account. The very first account becomes an administrator and is
   * always allowed; afterwards the registration mode and invites decide.
   */
  async register(input: RegisterInput): Promise<UserRow> {
    const { db, config, users, instance, invites } = this.deps
    if (!config.passwordLogin) throw new AppError(403, 'password_login_disabled')

    // Hash outside the transaction: better-sqlite3 transactions must be synchronous.
    const passwordHash = await hashPassword(input.password)

    return db.transaction((tx) => {
      let role: Role = 'user'
      if (users.count(tx) === 0) {
        role = 'admin'
        instance.initialize(tx, input.mode ?? 'standard')
      } else {
        if (config.registration === 'closed') throw new AppError(403, 'registration_closed')
        const invite = input.inviteToken ? invites.findUsable(tx, input.inviteToken) : undefined
        if (input.inviteToken && !invite) throw new AppError(400, 'invite_invalid')
        if (!invite && config.registration === 'invite') {
          throw new AppError(403, 'registration_closed')
        }
        if (invite) {
          invites.consume(tx, invite)
          role = invite.role
        }
      }

      const user = users.create(tx, {
        username: input.username,
        displayName: input.displayName,
        email: input.email,
        role,
        passwordHash,
        locale: input.locale ?? DEFAULT_LOCALE,
        timezone: input.timezone ?? 'UTC',
      })
      users.markLogin(user.id, tx)
      return user
    })
  }

  async login(input: LoginInput): Promise<UserRow> {
    const { config, users } = this.deps
    if (!config.passwordLogin) throw new AppError(403, 'password_login_disabled')

    const user = users.findByIdentifier(input.identifier)
    const valid = user?.passwordHash
      ? await verifyPassword(user.passwordHash, input.password)
      : await simulatePasswordVerification(input.password)
    if (!user || !valid) throw new AppError(401, 'invalid_credentials')
    // Only revealed after a correct password, so it does not leak which accounts exist.
    if (user.disabledAt) throw new AppError(403, 'account_disabled')

    users.markLogin(user.id)
    return user
  }

  /** Signs in (or registers, or links) the user behind a completed OIDC flow. */
  completeOidc(result: OidcResult, localeHint: string | undefined): UserRow {
    const { db, users } = this.deps
    const { claims } = result

    return db.transaction((tx) => {
      const identity = tx
        .select()
        .from(userIdentities)
        .where(
          and(eq(userIdentities.issuer, claims.issuer), eq(userIdentities.subject, claims.subject)),
        )
        .get()

      if (result.intent === 'link') {
        if (!result.userId) throw new AppError(401, 'unauthorized')
        if (identity && identity.userId !== result.userId) {
          throw new AppError(409, 'oidc_already_linked')
        }
        const user = users.findById(result.userId, tx)
        if (!user || user.disabledAt) throw new AppError(401, 'unauthorized')
        if (!identity) this.linkIdentity(tx, user.id, claims)
        return user
      }

      if (identity) {
        let user = users.findById(identity.userId, tx)
        if (!user) throw new AppError(400, 'oidc_failed')
        if (user.disabledAt) throw new AppError(403, 'account_disabled')
        tx.update(userIdentities)
          .set({ lastUsedAt: this.deps.now(), email: claims.email ?? null })
          .where(eq(userIdentities.id, identity.id))
          .run()
        user = this.syncAdminRole(tx, user, claims)
        users.markLogin(user.id, tx)
        return user
      }

      return this.registerFromOidc(tx, result, localeHint)
    })
  }

  /**
   * Changes the password and signs out every other session. Accounts created
   * through SSO have no password yet and may set one without the current one.
   */
  async changePassword(
    user: UserRow,
    currentSessionId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    if (user.passwordHash) {
      const valid =
        input.currentPassword !== undefined &&
        (await verifyPassword(user.passwordHash, input.currentPassword))
      if (!valid) throw new AppError(400, 'wrong_password')
    }
    const passwordHash = await hashPassword(input.newPassword)
    this.deps.users.update(user.id, { passwordHash })
    this.deps.sessions.revokeAllForUser(user.id, currentSessionId)
  }

  unlinkOidc(user: UserRow): void {
    if (!user.passwordHash) throw new AppError(409, 'identity_required')
    this.deps.db.delete(userIdentities).where(eq(userIdentities.userId, user.id)).run()
  }

  private registerFromOidc(
    tx: Executor,
    { claims, mode }: OidcResult,
    localeHint: string | undefined,
  ): UserRow {
    const { config, users, instance, logger } = this.deps
    if (!config.oidc?.autoRegister) throw new AppError(403, 'oidc_account_not_found')
    // Never attach an SSO login to an existing local account by email: the user
    // has to sign in with their password and link the identity explicitly.
    if (claims.email && users.findByEmail(claims.email, tx)) {
      throw new AppError(409, 'email_taken')
    }

    const isFirstUser = users.count(tx) === 0
    if (isFirstUser) instance.initialize(tx, mode ?? 'standard')
    const isInAdminGroup =
      config.oidc.adminGroup !== undefined && claims.groups.includes(config.oidc.adminGroup)

    const user = users.create(tx, {
      username: users.availableUsername(deriveUsername(claims), tx),
      displayName: (claims.name ?? claims.preferredUsername ?? claims.email ?? 'User').slice(0, 64),
      email: claims.email,
      role: isFirstUser || isInAdminGroup ? 'admin' : 'user',
      passwordHash: null,
      locale: pickLocale(claims.locale ?? localeHint),
      timezone: 'UTC',
    })
    this.linkIdentity(tx, user.id, claims)
    users.markLogin(user.id, tx)
    logger.info({ userId: user.id }, 'Created account from OIDC login')
    return user
  }

  private linkIdentity(tx: Executor, userId: string, claims: OidcClaims): void {
    // A user has at most one identity per issuer; linking again replaces it.
    tx.delete(userIdentities)
      .where(and(eq(userIdentities.userId, userId), eq(userIdentities.issuer, claims.issuer)))
      .run()
    const now = this.deps.now()
    tx.insert(userIdentities)
      .values({
        id: uuidv7(now.getTime()),
        userId,
        provider: 'oidc',
        issuer: claims.issuer,
        subject: claims.subject,
        email: claims.email ?? null,
        createdAt: now,
        lastUsedAt: now,
      })
      .run()
  }

  /** With `OIDC_ADMIN_GROUP` set, the identity provider decides who is an administrator. */
  private syncAdminRole(tx: Executor, user: UserRow, claims: OidcClaims): UserRow {
    const { config, users, logger } = this.deps
    const adminGroup = config.oidc?.adminGroup
    if (!adminGroup) return user

    const role: Role = claims.groups.includes(adminGroup) ? 'admin' : 'user'
    if (role === user.role) return user
    if (role === 'user' && !users.hasOtherActiveAdmin(user.id, tx)) {
      logger.warn({ userId: user.id }, 'Not demoting the last administrator despite OIDC groups')
      return user
    }
    return users.update(user.id, { role }, tx)
  }
}

/** Turns OIDC profile data into a valid username (`a-z0-9._-`, 3–32 characters). */
export function deriveUsername(claims: {
  preferredUsername?: string | undefined
  email?: string | undefined
}): string {
  const source = claims.preferredUsername ?? claims.email?.split('@')[0] ?? ''
  const cleaned = source
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 32)
    .replace(/[._-]+$/, '')
  return cleaned.length >= 3 ? cleaned : `user${cleaned ? `-${cleaned}` : ''}`
}

function pickLocale(hint: string | undefined): Locale {
  const language = hint?.toLowerCase().split(/[-_,;]/)[0]
  return SUPPORTED_LOCALES.find((locale) => locale === language) ?? DEFAULT_LOCALE
}
