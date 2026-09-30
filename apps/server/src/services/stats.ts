import {
  addDays,
  instantToZonedTime,
  startOfWeek,
  todayIn,
  type Stats,
  type ViewCounts,
} from '@crystal/shared'
import { and, eq, isNotNull, isNull } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { tasks, type UserRow } from '../db/schema.js'
import type { ViewService } from './views.js'

const WEEKS = 12

/**
 * A little look back: what the user completed per week, their streak of days
 * with something done, and what is still open. Completions count for the
 * person who ticked the task off, in their own time zone.
 */
export class StatsService {
  constructor(
    private readonly db: Db,
    private readonly views: ViewService,
    private readonly now: () => Date,
  ) {}

  forUser(user: UserRow): Stats {
    const today = todayIn(user.timezone, this.now())
    // Every completion ever, as local days. Households stay well within what this can handle.
    const days = this.db
      .select({ completedAt: tasks.completedAt })
      .from(tasks)
      .where(
        and(eq(tasks.completedBy, user.id), isNotNull(tasks.completedAt), isNull(tasks.deletedAt)),
      )
      .all()
      .map((row) => instantToZonedTime(row.completedAt!, user.timezone).date)

    const perDay = new Map<string, number>()
    for (const day of days) perDay.set(day, (perDay.get(day) ?? 0) + 1)

    const thisWeek = startOfWeek(today)
    const weeks = Array.from({ length: WEEKS }, (_, index) => {
      const start = addDays(thisWeek, (index - (WEEKS - 1)) * 7)
      let completed = 0
      for (let offset = 0; offset < 7; offset++)
        completed += perDay.get(addDays(start, offset)) ?? 0
      return { start, completed }
    })

    const counts: ViewCounts = this.views.counts(user)
    return {
      weeks,
      streak: streaks([...perDay.keys()], today),
      completedToday: perDay.get(today) ?? 0,
      completedTotal: days.length,
      open: counts.all,
      overdue: counts.overdue,
    }
  }
}

/**
 * The current streak ends today – or yesterday, as long as today is not over –
 * and the longest one anywhere in the past.
 */
export function streaks(
  days: readonly string[],
  today: string,
): { current: number; longest: number } {
  const done = new Set(days)
  let current = 0
  let day = done.has(today) ? today : addDays(today, -1)
  while (done.has(day)) {
    current++
    day = addDays(day, -1)
  }

  let longest = 0
  for (const start of done) {
    // Only count from the first day of each run.
    if (done.has(addDays(start, -1))) continue
    let length = 0
    let cursor = start
    while (done.has(cursor)) {
      length++
      cursor = addDays(cursor, 1)
    }
    longest = Math.max(longest, length)
  }
  return { current, longest }
}
