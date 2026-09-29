import {
  parsePreferences,
  uuidv7,
  type CreateChannelData,
  type NotificationChannel,
  type PushStatus,
  type PushSubscriptionInput,
  type UpdateChannelInput,
} from '@crystal/shared'
import { and, asc, count, eq, isNull } from 'drizzle-orm'

import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import {
  lists,
  notificationChannels,
  pushSubscriptions,
  tasks,
  users,
  type NotificationChannelRow,
  type PushSubscriptionRow,
  type UserRow,
} from '../db/schema.js'
import { deriveKey, seal, unseal } from '../lib/crypto.js'
import { AppError, notFound } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'
import {
  configFromInput,
  describeTarget,
  sendToChannel,
  type ChannelConfig,
} from '../notifications/channels.js'
import type { Mailer } from '../notifications/mailer.js'
import {
  assignedMessage,
  testMessage,
  type Notification,
  type TaskInfo,
} from '../notifications/messages.js'
import { DeliveryError, toDeliveryError, type DeliveryFailure } from '../notifications/network.js'
import type { PushSender } from '../notifications/push.js'

const MAX_CHANNELS = 20
const MAX_DEVICES = 20

export interface NotificationServiceDeps {
  db: Db
  config: Config
  logger: Logger
  now: () => Date
  secretKey: string
  version: string
  /** Undefined when SMTP is not configured. */
  mailer: Mailer | undefined
  push: PushSender
  vapidPublicKey: string
}

/**
 * Delivers notifications to a user's browsers (Web Push) and channels (ntfy,
 * Gotify, Apprise, email). Deliveries run in the background: a slow or broken
 * service never holds up a request, and failures are recorded on the channel.
 */
export class NotificationService {
  private readonly channelKey: Buffer
  private readonly pending = new Set<Promise<void>>()

  constructor(private readonly deps: NotificationServiceDeps) {
    this.channelKey = deriveKey(deps.secretKey, 'notification-channels')
  }

  /** Whether email can be sent at all (SMTP is configured). */
  get emailAvailable(): boolean {
    return this.deps.mailer !== undefined
  }

  get mailer(): Mailer | undefined {
    return this.deps.mailer
  }

  /* ── Channels ─────────────────────────────────────────────────── */

  listChannels(user: UserRow): NotificationChannel[] {
    return this.deps.db
      .select()
      .from(notificationChannels)
      .where(eq(notificationChannels.userId, user.id))
      .orderBy(asc(notificationChannels.createdAt), asc(notificationChannels.id))
      .all()
      .map((row) => this.toChannel(user, row))
  }

  createChannel(user: UserRow, input: CreateChannelData): NotificationChannel {
    const { db, now } = this.deps
    if (input.type === 'email') {
      if (!this.deps.mailer) throw new AppError(400, 'email_not_configured')
      if (!user.email) throw new AppError(400, 'email_required')
    }
    const existing =
      db
        .select({ value: count() })
        .from(notificationChannels)
        .where(eq(notificationChannels.userId, user.id))
        .get()?.value ?? 0
    if (existing >= MAX_CHANNELS) {
      throw new AppError(400, 'validation_failed', `You can add up to ${MAX_CHANNELS} channels.`)
    }
    const config = configFromInput(input)
    const time = now()
    const row = db
      .insert(notificationChannels)
      .values({
        id: uuidv7(time.getTime()),
        userId: user.id,
        type: config.type,
        name: input.name,
        config: seal(JSON.stringify(config), this.channelKey),
        target: describeTarget(config),
        enabled: true,
        createdAt: time,
        updatedAt: time,
      })
      .returning()
      .get()
    return this.toChannel(user, row)
  }

  updateChannel(user: UserRow, channelId: string, input: UpdateChannelInput): NotificationChannel {
    const row = this.findChannel(user, channelId)
    const updated = this.deps.db
      .update(notificationChannels)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
        updatedAt: this.deps.now(),
      })
      .where(eq(notificationChannels.id, row.id))
      .returning()
      .get()
    return this.toChannel(user, updated)
  }

  deleteChannel(user: UserRow, channelId: string): void {
    const result = this.deps.db
      .delete(notificationChannels)
      .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.userId, user.id)))
      .run()
    if (result.changes === 0) throw notFound()
  }

  /** Sends a test message right away, even to a paused channel; fails with the reason. */
  async testChannel(user: UserRow, channelId: string): Promise<NotificationChannel> {
    const row = this.findChannel(user, channelId)
    const failure = await this.sendToChannel(user, row, testMessage(user.locale))
    if (failure) throw deliveryFailed(failure)
    return this.toChannel(user, this.findChannel(user, channelId))
  }

  /* ── Web Push ─────────────────────────────────────────────────── */

  pushStatus(user: UserRow): PushStatus {
    return {
      publicKey: this.deps.vapidPublicKey,
      devices: this.devicesOf(user.id).map((row) => ({
        id: row.id,
        endpoint: row.endpoint,
        userAgent: row.userAgent,
        createdAt: row.createdAt.toISOString(),
      })),
    }
  }

  /**
   * Registers this browser for Web Push. A browser has a single subscription,
   * so signing in with another account on it moves the subscription there.
   */
  subscribePush(user: UserRow, input: PushSubscriptionInput, userAgent: string | undefined): void {
    const { db, now } = this.deps
    db.transaction((tx) => {
      const time = now()
      tx.insert(pushSubscriptions)
        .values({
          id: uuidv7(time.getTime()),
          userId: user.id,
          endpoint: input.endpoint,
          p256dh: input.keys.p256dh,
          auth: input.keys.auth,
          userAgent: userAgent?.slice(0, 500) ?? null,
          createdAt: time,
        })
        .onConflictDoUpdate({
          target: pushSubscriptions.endpoint,
          set: {
            userId: user.id,
            p256dh: input.keys.p256dh,
            auth: input.keys.auth,
            userAgent: userAgent?.slice(0, 500) ?? null,
          },
        })
        .run()
      // Keep the newest devices; forgotten old browsers drop out.
      const devices = tx
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(eq(pushSubscriptions.userId, user.id))
        .orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id))
        .all()
      for (const device of devices.slice(0, Math.max(0, devices.length - MAX_DEVICES))) {
        tx.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id)).run()
      }
    })
  }

  removePushDevice(user: UserRow, deviceId: string): void {
    const result = this.deps.db
      .delete(pushSubscriptions)
      .where(and(eq(pushSubscriptions.id, deviceId), eq(pushSubscriptions.userId, user.id)))
      .run()
    if (result.changes === 0) throw notFound()
  }

  /** Sends a test message to every browser of the user; fails if none received it. */
  async testPush(user: UserRow): Promise<void> {
    const devices = this.devicesOf(user.id)
    if (devices.length === 0) throw notFound()
    const failures = await Promise.all(
      devices.map((device) => this.sendToDevice(device, testMessage(user.locale))),
    )
    if (failures.every(Boolean)) throw deliveryFailed(failures[0]!)
  }

  /* ── Delivery ─────────────────────────────────────────────────── */

  /**
   * Sends to all of the user's browsers and enabled channels. Failures are
   * logged and recorded on the channel; this never throws.
   */
  async deliver(user: UserRow, notification: Notification): Promise<void> {
    const channels = this.deps.db
      .select()
      .from(notificationChannels)
      .where(and(eq(notificationChannels.userId, user.id), eq(notificationChannels.enabled, true)))
      .all()
    await Promise.all([
      ...this.devicesOf(user.id).map((device) => this.sendToDevice(device, notification)),
      ...channels.map((channel) => this.sendToChannel(user, channel, notification)),
    ])
  }

  /** Runs work in the background; `idle()` waits until all of it is done. */
  dispatch(work: () => Promise<void>): void {
    const promise: Promise<void> = work()
      .catch((error: unknown) => {
        this.deps.logger.error({ err: error }, 'Sending notifications failed')
      })
      .finally(() => this.pending.delete(promise))
    this.pending.add(promise)
  }

  async idle(): Promise<void> {
    while (this.pending.size > 0) await Promise.all([...this.pending])
  }

  /** Lets the new assignee know, unless they turned that off. */
  taskAssigned(assignedBy: UserRow, taskId: string, assigneeId: string): void {
    this.dispatch(async () => {
      const assignee = this.deps.db.select().from(users).where(eq(users.id, assigneeId)).get()
      if (!assignee || assignee.disabledAt) return
      if (!parsePreferences(assignee.preferences).notifyAssigned) return
      const task = this.taskInfo(taskId)
      if (!task) return
      await this.deliver(assignee, assignedMessage(assignee.locale, assignedBy.displayName, task))
    })
  }

  /** Title, list and due date of an open task for a message. */
  taskInfo(taskId: string): TaskInfo | undefined {
    return this.deps.db
      .select({
        id: tasks.id,
        listId: tasks.listId,
        title: tasks.title,
        listName: lists.name,
        dueDate: tasks.dueDate,
        dueTime: tasks.dueTime,
      })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .where(
        and(
          eq(tasks.id, taskId),
          isNull(tasks.deletedAt),
          isNull(tasks.completedAt),
          isNull(lists.deletedAt),
        ),
      )
      .get()
  }

  /* ── Internals ──────────────────────────────────────────────── */

  private async sendToChannel(
    user: UserRow,
    row: NotificationChannelRow,
    notification: Notification,
  ): Promise<DeliveryFailure | undefined> {
    const { db, config, logger, now, mailer, version } = this.deps
    let failure: DeliveryFailure | undefined
    const raw = unseal(row.config, this.channelKey)
    if (raw === null) {
      // Sealed with another SECRET_KEY; the channel has to be added again.
      failure = 'config'
    } else {
      try {
        await sendToChannel(JSON.parse(raw) as ChannelConfig, notification, {
          policy: { allowPrivate: config.notifyPrivateNetworks, userAgent: `Crystal/${version}` },
          baseUrl: config.baseUrl,
          mailer,
          recipient: { email: user.email, locale: user.locale },
        })
      } catch (error) {
        failure = toDeliveryError(error).reason
      }
    }
    if (failure) {
      logger.warn({ channelId: row.id, type: row.type, reason: failure }, 'Notification failed')
    }
    db.update(notificationChannels)
      .set(failure ? { lastError: failure } : { lastSentAt: now(), lastError: null })
      .where(eq(notificationChannels.id, row.id))
      .run()
    return failure
  }

  private async sendToDevice(
    device: PushSubscriptionRow,
    notification: Notification,
  ): Promise<DeliveryFailure | undefined> {
    try {
      await this.deps.push.send(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(notification),
      )
      return undefined
    } catch (error) {
      const failure = error instanceof DeliveryError ? error.reason : toDeliveryError(error).reason
      if (failure === 'gone') {
        this.deps.db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, device.id)).run()
      } else {
        this.deps.logger.warn({ deviceId: device.id, reason: failure }, 'Web Push failed')
      }
      return failure
    }
  }

  private devicesOf(userId: string): PushSubscriptionRow[] {
    return this.deps.db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId))
      .orderBy(asc(pushSubscriptions.createdAt), asc(pushSubscriptions.id))
      .all()
  }

  private findChannel(user: UserRow, channelId: string): NotificationChannelRow {
    const row = this.deps.db
      .select()
      .from(notificationChannels)
      .where(and(eq(notificationChannels.id, channelId), eq(notificationChannels.userId, user.id)))
      .get()
    if (!row) throw notFound()
    return row
  }

  private toChannel(user: UserRow, row: NotificationChannelRow): NotificationChannel {
    return {
      id: row.id,
      type: row.type,
      name: row.name,
      // Email goes to whatever address the account has now.
      target: row.type === 'email' ? (user.email ?? '') : row.target,
      enabled: row.enabled,
      lastSentAt: row.lastSentAt?.toISOString() ?? null,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
    }
  }
}

function deliveryFailed(reason: DeliveryFailure): AppError {
  return new AppError(502, 'delivery_failed', undefined, { reason })
}
