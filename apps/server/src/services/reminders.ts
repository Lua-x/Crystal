import { instantToZonedTime, parsePreferences, todayIn } from '@crystal/shared'
import { and, asc, count, eq, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { listMembers, lists, tasks, users, type UserRow } from '../db/schema.js'
import type { Logger } from '../lib/logger.js'
import { reminderMessage, summaryMessage, type Notification } from '../notifications/messages.js'
import type { NotificationService } from './notifications.js'

const HOUR_MS = 60 * 60 * 1000
/** Reminders missed by more than this (e.g. while the server was down) are dropped. */
const STALE_AFTER_MS = 24 * HOUR_MS
/** A daily summary goes out at most this long after its time, not in the evening. */
const SUMMARY_WINDOW_MINUTES = 120

interface Delivery {
  user: UserRow
  notification: Notification
}

/**
 * Sends due reminders and daily summaries. Each tick first marks what it is
 * about to send, so nothing goes out twice – even if sending then fails.
 */
export class ReminderService {
  private timer: NodeJS.Timeout | undefined
  private running: Promise<void> | undefined

  constructor(
    private readonly db: Db,
    private readonly notifications: NotificationService,
    private readonly logger: Logger,
    private readonly now: () => Date,
  ) {}

  start(intervalMs: number): void {
    this.timer = setInterval(() => void this.tick(), intervalMs)
    this.timer.unref()
    void this.tick()
  }

  /** Stops the timer and waits for the current tick. */
  async stop(): Promise<void> {
    clearInterval(this.timer)
    await this.running
  }

  /** Runs one round; overlapping calls share the round in progress. */
  tick(): Promise<void> {
    this.running ??= this.run().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  private async run(): Promise<void> {
    let deliveries: Delivery[]
    try {
      deliveries = [...this.claimReminders(), ...this.claimSummaries()]
    } catch (error) {
      this.logger.error({ err: error }, 'Checking reminders failed')
      return
    }
    await Promise.all(
      deliveries.map(({ user, notification }) =>
        this.notifications.deliver(user, notification).catch((error: unknown) => {
          this.logger.error({ err: error }, 'Sending a reminder failed')
        }),
      ),
    )
  }

  private claimReminders(): Delivery[] {
    const now = this.now()
    return this.db.transaction((tx) => {
      // Completed and deleted tasks are claimed too, so they are not looked at again.
      const due = tx
        .update(tasks)
        .set({ remindedAt: now })
        .where(and(isNull(tasks.remindedAt), isNotNull(tasks.remindAt), lte(tasks.remindAt, now)))
        .returning()
        .all()

      const deliveries: Delivery[] = []
      for (const task of due) {
        if (task.completedAt || task.deletedAt) continue
        if (now.getTime() - task.remindAt!.getTime() > STALE_AFTER_MS) continue
        // The person taking care of the task, or whoever set the reminder.
        const recipientId = task.assigneeId ?? task.reminderBy
        if (!recipientId) continue
        const recipient = tx
          .select({ user: users })
          .from(users)
          .innerJoin(listMembers, eq(listMembers.userId, users.id))
          .innerJoin(lists, eq(lists.id, listMembers.listId))
          .where(
            and(
              eq(users.id, recipientId),
              eq(listMembers.listId, task.listId),
              isNull(users.disabledAt),
              isNull(lists.deletedAt),
            ),
          )
          .get()
        const list = tx
          .select({ name: lists.name })
          .from(lists)
          .where(eq(lists.id, task.listId))
          .get()
        if (!recipient || !list) continue
        const user = recipient.user
        deliveries.push({
          user,
          notification: reminderMessage(user.locale, todayIn(user.timezone, now), {
            ...task,
            listName: list.name,
          }),
        })
      }
      return deliveries
    })
  }

  private claimSummaries(): Delivery[] {
    const now = this.now()
    const candidates = this.db
      .select()
      .from(users)
      .where(
        and(
          isNull(users.disabledAt),
          sql`json_extract(${users.preferences}, '$.dailySummary') = 1`,
        ),
      )
      .all()

    const deliveries: Delivery[] = []
    for (const user of candidates) {
      const preferences = parsePreferences(user.preferences)
      const local = instantToZonedTime(now, user.timezone)
      if (user.summarySentOn === local.date) continue
      const minutesLate = toMinutes(local.time) - toMinutes(preferences.dailySummaryTime)
      if (minutesLate < 0 || minutesLate >= SUMMARY_WINDOW_MINUTES) continue

      const claimed = this.db
        .update(users)
        .set({ summarySentOn: local.date })
        .where(
          and(
            eq(users.id, user.id),
            or(isNull(users.summarySentOn), sql`${users.summarySentOn} <> ${local.date}`),
          ),
        )
        .run().changes
      if (claimed === 0) continue

      const notification = this.summary(user, local.date)
      if (notification) deliveries.push({ user, notification })
    }
    return deliveries
  }

  /** Open tasks due today and overdue ones, leaving out those assigned to others. */
  private summary(user: UserRow, today: string): Notification | undefined {
    const mine = and(
      isNull(tasks.deletedAt),
      isNull(tasks.completedAt),
      isNull(lists.deletedAt),
      or(isNull(tasks.assigneeId), eq(tasks.assigneeId, user.id)),
    )
    const member = and(eq(listMembers.listId, tasks.listId), eq(listMembers.userId, user.id))

    const dueToday = this.db
      .select({ title: tasks.title, dueTime: tasks.dueTime })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(listMembers, member)
      .where(and(mine, eq(tasks.dueDate, today)))
      .orderBy(asc(sql`${tasks.dueTime} is null`), asc(tasks.dueTime), asc(tasks.position))
      .all()
    const overdue =
      this.db
        .select({ value: count() })
        .from(tasks)
        .innerJoin(lists, eq(lists.id, tasks.listId))
        .innerJoin(listMembers, member)
        .where(and(mine, lt(tasks.dueDate, today)))
        .get()?.value ?? 0

    if (dueToday.length === 0 && overdue === 0) return undefined
    return summaryMessage(user.locale, dueToday, overdue)
  }
}

function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  return hours * 60 + minutes
}
