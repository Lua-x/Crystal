import type { RunResult } from 'better-sqlite3'
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'

import type * as schema from './schema.js'

/** Either the database or an open transaction; both run queries synchronously. */
export type Executor = BaseSQLiteDatabase<'sync', RunResult, typeof schema>
