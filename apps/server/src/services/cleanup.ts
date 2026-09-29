import { isNotNull, and, lt } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { lists, myDay, tasks } from '../db/schema.js'
import type { PasswordResetService } from './password-resets.js'
import type { SearchService } from './search.js'
import type { SessionService } from './sessions.js'

const DAY_MS = 24 * 60 * 60 * 1000
/** Deleted lists and tasks stay restorable (and visible to syncing clients) this long. */
export const TRASH_RETENTION_DAYS = 30

/** Periodic housekeeping; runs hourly and is safe to run at any time. */
export class CleanupService {
  constructor(
    private readonly db: Db,
    private readonly search: SearchService,
    private readonly sessions: SessionService,
    private readonly passwordResets: PasswordResetService,
    private readonly now: () => Date,
  ) {}

  run(): { sessions: number; passwordResets: number; tasks: number; lists: number } {
    const cutoff = new Date(this.now().getTime() - TRASH_RETENTION_DAYS * DAY_MS)
    return this.db.transaction((tx) => {
      const removedTasks = tx
        .delete(tasks)
        .where(and(isNotNull(tasks.deletedAt), lt(tasks.deletedAt, cutoff)))
        .run().changes
      // Removing a list also removes its tasks, members and My Day entries (cascade).
      const removedLists = tx
        .delete(lists)
        .where(and(isNotNull(lists.deletedAt), lt(lists.deletedAt, cutoff)))
        .run().changes
      // My Day entries only matter for today; keep a week for time zone leeway.
      const oldDate = new Date(this.now().getTime() - 7 * DAY_MS).toISOString().slice(0, 10)
      tx.delete(myDay).where(lt(myDay.date, oldDate)).run()
      this.search.removeOrphans(tx)
      return {
        sessions: this.sessions.deleteExpired(),
        passwordResets: this.passwordResets.deleteExpired(),
        tasks: removedTasks,
        lists: removedLists,
      }
    })
  }
}
