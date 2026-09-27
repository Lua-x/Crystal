import { OidcService } from '../auth/oidc.js'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { deriveKey } from '../lib/crypto.js'
import type { Logger } from '../lib/logger.js'
import { RateLimiter } from '../lib/rate-limit.js'
import { AdminService } from './admin.js'
import { AuthService } from './auth.js'
import { InviteService } from './invites.js'
import { SessionService } from './sessions.js'
import { UserService } from './users.js'

const MINUTE_MS = 60 * 1000

export interface Services {
  config: Config
  logger: Logger
  db: Db
  now: () => Date
  version: string
  users: UserService
  sessions: SessionService
  invites: InviteService
  auth: AuthService
  admin: AdminService
  oidc: OidcService | undefined
  limits: {
    /** All sign-in attempts from one address. */
    loginPerIp: RateLimiter
    /** Sign-in attempts for one account from one address. */
    loginPerAccount: RateLimiter
    register: RateLimiter
    /** Overall API budget per user (or address when signed out). */
    api: RateLimiter
  }
}

export interface ServiceOptions {
  config: Config
  logger: Logger
  db: Db
  secretKey: string
  version: string
  now?: () => Date
}

export function createServices(options: ServiceOptions): Services {
  const { config, logger, db, secretKey, version } = options
  const now = options.now ?? (() => new Date())
  const clock = () => now().getTime()

  const users = new UserService(db, now)
  const invites = new InviteService(db, now)
  const sessions = new SessionService(db, config.sessionTtlDays, now)
  const auth = new AuthService({ db, config, logger, users, invites, sessions, now, version })
  const admin = new AdminService(db, users, sessions)
  const oidc =
    config.oidc && config.baseUrl
      ? new OidcService(
          config.oidc,
          config.baseUrl,
          deriveKey(secretKey, 'oidc-flow'),
          logger,
          clock,
        )
      : undefined

  return {
    config,
    logger,
    db,
    now,
    version,
    users,
    sessions,
    invites,
    auth,
    admin,
    oidc,
    limits: {
      loginPerIp: new RateLimiter(50, 15 * MINUTE_MS, clock),
      loginPerAccount: new RateLimiter(10, 15 * MINUTE_MS, clock),
      register: new RateLimiter(10, 60 * MINUTE_MS, clock),
      api: new RateLimiter(600, MINUTE_MS, clock),
    },
  }
}
