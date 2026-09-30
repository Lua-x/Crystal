import { OidcService } from '../auth/oidc.js'
import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { deriveKey } from '../lib/crypto.js'
import type { Logger } from '../lib/logger.js'
import { RateLimiter } from '../lib/rate-limit.js'
import { SteamClient } from '../steam/client.js'
import { createMailer, type Mailer } from '../notifications/mailer.js'
import { createWebPushSender, deriveVapidKeys, type PushSender } from '../notifications/push.js'
import { AdminService } from './admin.js'
import { ApiTokenService } from './api-tokens.js'
import { AttachmentService } from './attachments.js'
import { AuthService } from './auth.js'
import { BackupService } from './backups.js'
import { CalendarService } from './calendar.js'
import { CleanupService } from './cleanup.js'
import { EventHub } from './events.js'
import { ImageService } from './images.js'
import { InstanceService } from './instance.js'
import { InviteService } from './invites.js'
import { ListService } from './lists.js'
import { NotificationService } from './notifications.js'
import { PasswordResetService } from './password-resets.js'
import { ReminderService } from './reminders.js'
import { SearchService } from './search.js'
import { SessionService } from './sessions.js'
import { SteamService } from './steam.js'
import { StatsService } from './stats.js'
import { TaskService } from './tasks.js'
import { TransferService } from './transfer.js'
import { UserService } from './users.js'
import { ViewService } from './views.js'

const MINUTE_MS = 60 * 1000
const PROJECT_URL = 'https://github.com/Lua-x/Crystal'

export interface Services {
  config: Config
  logger: Logger
  db: Db
  now: () => Date
  version: string
  /** What the instance is for (everyday or gaming). */
  instance: InstanceService
  users: UserService
  sessions: SessionService
  /** Personal API tokens. */
  apiTokens: ApiTokenService
  invites: InviteService
  auth: AuthService
  passwordResets: PasswordResetService
  admin: AdminService
  oidc: OidcService | undefined
  search: SearchService
  /** Live updates for open apps. */
  events: EventHub
  notifications: NotificationService
  reminders: ReminderService
  /** Private iCal feeds of due tasks. */
  calendar: CalendarService
  /** Export to and import from files. */
  transfer: TransferService
  /** Automatic and manual database backups. */
  backups: BackupService
  /** Images and PDFs attached to tasks. */
  attachments: AttachmentService
  /** Pictures of lists, such as game covers. */
  images: ImageService
  lists: ListService
  tasks: TaskService
  views: ViewService
  stats: StatsService
  /** Steam achievements as goals. */
  steam: SteamService
  cleanup: CleanupService
  limits: {
    /** All sign-in attempts from one address. */
    loginPerIp: RateLimiter
    /** Sign-in attempts for one account from one address. */
    loginPerAccount: RateLimiter
    register: RateLimiter
    /** "Forgot password" requests from one address. */
    passwordReset: RateLimiter
    /** Calendar feed downloads from one address. */
    calendarFeeds: RateLimiter
    /** Overall API budget per user (or address when signed out). */
    api: RateLimiter
    /** Requests that reach Steam, per user; they count against the instance's key. */
    steam: RateLimiter
  }
}

export interface ServiceOptions {
  config: Config
  logger: Logger
  db: Db
  secretKey: string
  version: string
  now?: () => Date
  /** Replaces SMTP (tests); `undefined` uses the configuration. */
  mailer?: Mailer
  /** Replaces the real Web Push delivery (tests). */
  pushSender?: PushSender
  /** Replaces the network for Steam requests (tests). */
  steamFetch?: typeof fetch
}

export function createServices(options: ServiceOptions): Services {
  const { config, logger, db, secretKey, version } = options
  const now = options.now ?? (() => new Date())
  const clock = () => now().getTime()

  const vapidKeys = deriveVapidKeys(secretKey)
  const notifications = new NotificationService({
    db,
    config,
    logger,
    now,
    secretKey,
    version,
    mailer: options.mailer ?? (config.smtp ? createMailer(config.smtp) : undefined),
    push:
      options.pushSender ??
      createWebPushSender({
        keys: vapidKeys,
        subject: vapidSubject(config),
        allowPrivate: config.notifyPrivateNetworks,
      }),
    vapidPublicKey: vapidKeys.publicKey,
  })

  const instance = new InstanceService(db, now)
  const users = new UserService(db, now)
  const invites = new InviteService(db, now)
  const sessions = new SessionService(db, config.sessionTtlDays, now)
  const apiTokens = new ApiTokenService(db, now)
  const passwordResets = new PasswordResetService({
    db,
    config,
    logger,
    users,
    sessions,
    notifications,
    now,
  })
  const auth = new AuthService({
    db,
    config,
    logger,
    users,
    instance,
    invites,
    sessions,
    passwordResets,
    now,
    version,
  })
  const search = new SearchService(db)
  const events = new EventHub(db)
  const lists = new ListService(db, search, events, instance, now)
  const attachments = new AttachmentService(db, lists, events, config.attachments, now)
  const images = new ImageService(db, lists, events, config.images, now)
  const tasks = new TaskService(db, lists, search, events, notifications, attachments, now)
  const views = new ViewService(db, tasks, search)
  const stats = new StatsService(db, views, now)
  const steam = new SteamService({
    db,
    client: config.steam ? new SteamClient(config.steam, options.steamFetch) : undefined,
    syncHours: config.steam?.syncHours ?? 0,
    lists,
    images,
    search,
    events,
    logger,
    now,
  })
  const reminders = new ReminderService(db, notifications, logger, now)
  const calendar = new CalendarService(db, config, secretKey, version, now)
  const transfer = new TransferService(db, lists, search, events, now)
  const backups = new BackupService(db, config.backups, logger, now)
  const cleanup = new CleanupService(db, search, { sessions, passwordResets, apiTokens }, now)
  const admin = new AdminService(db, users, sessions, lists)
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
    instance,
    users,
    sessions,
    apiTokens,
    invites,
    auth,
    passwordResets,
    admin,
    oidc,
    search,
    events,
    notifications,
    reminders,
    calendar,
    transfer,
    backups,
    attachments,
    images,
    lists,
    tasks,
    views,
    stats,
    steam,
    cleanup,
    limits: {
      loginPerIp: new RateLimiter(50, 15 * MINUTE_MS, clock),
      loginPerAccount: new RateLimiter(10, 15 * MINUTE_MS, clock),
      register: new RateLimiter(10, 60 * MINUTE_MS, clock),
      passwordReset: new RateLimiter(5, 15 * MINUTE_MS, clock),
      calendarFeeds: new RateLimiter(120, 60 * MINUTE_MS, clock),
      api: new RateLimiter(600, MINUTE_MS, clock),
      steam: new RateLimiter(60, 60 * MINUTE_MS, clock),
    },
  }
}

/**
 * Push services want a way to reach whoever runs the server: the instance's
 * public HTTPS address, else the sender address for email, else the project.
 */
function vapidSubject(config: Config): string {
  if (config.baseUrl?.protocol === 'https:') return config.baseUrl.origin
  const from = config.smtp?.from.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] ?? config.smtp?.from
  if (from && /^[^\s@<>]+@[^\s@<>]+$/.test(from)) return `mailto:${from}`
  return PROJECT_URL
}
