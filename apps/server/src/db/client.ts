import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'

import * as schema from './schema.js'

/** Drizzle on top of better-sqlite3; `$client` is the raw connection (used for backups). */
export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database }

export interface DatabaseHandle {
  db: Db
  sqlite: Database.Database
  close: () => void
}

/**
 * Opens (or creates) the SQLite database. Use `:memory:` for tests.
 * WAL mode lets readers proceed while a write is in progress.
 */
export function openDatabase(filename: string): DatabaseHandle {
  const sqlite = new Database(filename)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('synchronous = NORMAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')

  const db = drizzle({ client: sqlite, schema })
  return { db, sqlite, close: () => sqlite.close() }
}

/** Applies pending migrations from the generated SQL files. */
export function runMigrations(db: Db, migrationsFolder: string): void {
  migrate(db, { migrationsFolder })
}
