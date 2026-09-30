import type { InstanceMode } from '@crystal/shared'
import { eq } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { instance } from '../db/schema.js'
import type { Executor } from '../db/types.js'

const ROW_ID = 1

/**
 * Settings of the instance as a whole. The mode – everyday lists or games – is
 * chosen together with the first account and cannot be changed afterwards.
 */
export class InstanceService {
  /** Only set once the choice is committed; it never changes after that. */
  private cachedMode: InstanceMode | undefined

  constructor(
    private readonly db: Db,
    private readonly now: () => Date,
  ) {}

  /** `null` until the first account exists. */
  mode(executor: Executor = this.db): InstanceMode | null {
    if (this.cachedMode) return this.cachedMode
    const row = executor
      .select({ mode: instance.mode })
      .from(instance)
      .where(eq(instance.id, ROW_ID))
      .get()
    // Inside a transaction the row may still be rolled back, so only cache committed reads.
    if (row && executor === this.db) this.cachedMode = row.mode
    return row?.mode ?? null
  }

  /** Records the mode along with the first account. An existing choice is kept. */
  initialize(tx: Executor, mode: InstanceMode): void {
    tx.insert(instance)
      .values({ id: ROW_ID, mode, createdAt: this.now() })
      .onConflictDoNothing()
      .run()
  }
}
