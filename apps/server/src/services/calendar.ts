import { addDays, todayIn, zonedTimeToInstant, type CalendarFeed } from '@crystal/shared'
import { and, asc, eq, gte, inArray, isNotNull, isNull, or } from 'drizzle-orm'

import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import {
  calendarFeeds,
  listMembers,
  lists,
  tasks,
  taskTags,
  users,
  type UserRow,
} from '../db/schema.js'
import { deriveKey, randomToken, seal, sha256, unseal } from '../lib/crypto.js'
import { notFound } from '../lib/errors.js'
import { renderCalendar, type CalendarEvent } from '../lib/ical.js'

/** Overdue tasks stay in the calendar this long. */
const PAST_DAYS = 90
const MAX_EVENTS = 2000
/** Timed tasks show up as half-hour events. */
const EVENT_MINUTES = 30
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000

export const feedPath = (token: string) => `/api/calendar/${token}.ics`

/**
 * Private calendar feeds: open tasks with a due date, for calendar apps to
 * subscribe to. Like the daily summary, tasks assigned to someone else are
 * left out.
 */
export class CalendarService {
  private readonly key: Buffer

  constructor(
    private readonly db: Db,
    private readonly config: Config,
    secretKey: string,
    private readonly version: string,
    private readonly now: () => Date,
  ) {
    this.key = deriveKey(secretKey, 'calendar-feeds')
  }

  get(user: UserRow): CalendarFeed | null {
    const row = this.db.select().from(calendarFeeds).where(eq(calendarFeeds.userId, user.id)).get()
    if (!row) return null
    const token = unseal(row.token, this.key)
    // Sealed with another SECRET_KEY: the link has to be created again.
    if (token === null) return null
    return {
      path: feedPath(token),
      createdAt: row.createdAt.toISOString(),
      lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    }
  }

  /** Creates the feed, or replaces its link (the old one stops working). */
  create(user: UserRow): CalendarFeed {
    const token = randomToken()
    const now = this.now()
    const values = { tokenHash: sha256(token), token: seal(token, this.key), createdAt: now }
    this.db
      .insert(calendarFeeds)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: calendarFeeds.userId, set: { ...values, lastUsedAt: null } })
      .run()
    return { path: feedPath(token), createdAt: now.toISOString(), lastUsedAt: null }
  }

  delete(user: UserRow): void {
    const result = this.db.delete(calendarFeeds).where(eq(calendarFeeds.userId, user.id)).run()
    if (result.changes === 0) throw notFound()
  }

  /** The feed as iCalendar text, or `null` if the token is unknown. */
  render(token: string): string | null {
    const row = this.db
      .select({ feed: calendarFeeds, user: users })
      .from(calendarFeeds)
      .innerJoin(users, eq(users.id, calendarFeeds.userId))
      .where(eq(calendarFeeds.tokenHash, sha256(token)))
      .get()
    if (!row || row.user.disabledAt) return null
    const { user } = row

    const now = this.now()
    if (now.getTime() - (row.feed.lastUsedAt?.getTime() ?? 0) >= LAST_USED_RESOLUTION_MS) {
      this.db
        .update(calendarFeeds)
        .set({ lastUsedAt: now })
        .where(eq(calendarFeeds.userId, user.id))
        .run()
    }

    const today = todayIn(user.timezone, now)
    const due = this.db
      .select({ task: tasks, listName: lists.name })
      .from(tasks)
      .innerJoin(lists, eq(lists.id, tasks.listId))
      .innerJoin(
        listMembers,
        and(eq(listMembers.listId, tasks.listId), eq(listMembers.userId, user.id)),
      )
      .where(
        and(
          isNull(tasks.deletedAt),
          isNull(tasks.completedAt),
          isNull(lists.deletedAt),
          isNotNull(tasks.dueDate),
          gte(tasks.dueDate, addDays(today, -PAST_DAYS)),
          or(isNull(tasks.assigneeId), eq(tasks.assigneeId, user.id)),
        ),
      )
      .orderBy(asc(tasks.dueDate), asc(tasks.dueTime), asc(tasks.id))
      .limit(MAX_EVENTS)
      .all()

    const tagsByTask = new Map<string, string[]>()
    if (due.length > 0) {
      for (const tag of this.db
        .select()
        .from(taskTags)
        .where(
          inArray(
            taskTags.taskId,
            due.map((row) => row.task.id),
          ),
        )
        .orderBy(asc(taskTags.tag))
        .all()) {
        tagsByTask.set(tag.taskId, [...(tagsByTask.get(tag.taskId) ?? []), tag.tag])
      }
    }

    const events: CalendarEvent[] = due.map(({ task, listName }) => {
      const dueDate = task.dueDate!
      const start = task.dueTime ? zonedTimeToInstant(dueDate, task.dueTime, user.timezone) : null
      const link = this.config.baseUrl
        ? new URL(`/lists/${task.listId}?task=${task.id}`, this.config.baseUrl).href
        : undefined
      return {
        uid: `${task.id}@crystal`,
        stamp: task.updatedAt,
        summary: task.title,
        description: task.notes.trim() ? `${listName}\n\n${task.notes.trim()}` : listName,
        url: link,
        categories: tagsByTask.get(task.id) ?? [],
        time: start
          ? { kind: 'instant', start, end: new Date(start.getTime() + EVENT_MINUTES * 60_000) }
          : { kind: 'date', date: dueDate },
      }
    })

    return renderCalendar({
      productId: `-//Crystal//Crystal ${this.version}//EN`,
      name: 'Crystal',
      refreshInterval: 'PT1H',
      events,
    })
  }
}
