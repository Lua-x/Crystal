import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'

import type { Backup, BackupStatus } from '@crystal/shared'

import type { Config } from '../config.js'
import type { Db } from '../db/client.js'
import { notFound } from '../lib/errors.js'
import type { Logger } from '../lib/logger.js'

const NAME = /^crystal-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})Z\.db$/
const HOUR_MS = 60 * 60 * 1000
/** Give the server a moment after starting before the first backup. */
const FIRST_CHECK_MS = 60 * 1000

/**
 * Consistent copies of the SQLite database, made with SQLite's online backup
 * while Crystal keeps running. The newest `BACKUP_RETENTION` files are kept.
 */
export class BackupService {
  private timer: NodeJS.Timeout | undefined
  private firstCheck: NodeJS.Timeout | undefined
  private running: Promise<Backup> | undefined

  constructor(
    private readonly db: Db,
    private readonly config: Config['backups'],
    private readonly logger: Logger,
    private readonly now: () => Date,
  ) {}

  async status(): Promise<BackupStatus> {
    return {
      intervalHours: this.config.intervalHours,
      retention: this.config.retention,
      directory: this.config.directory,
      backups: await this.list(),
    }
  }

  /** Backups on disk, newest first. */
  async list(): Promise<Backup[]> {
    let names: string[]
    try {
      names = await readdir(this.config.directory)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
      throw error
    }
    const backups: Backup[] = []
    for (const name of names) {
      const createdAt = createdAtOf(name)
      if (!createdAt) continue
      const info = await stat(join(this.config.directory, name))
      backups.push({ name, size: info.size, createdAt: createdAt.toISOString() })
    }
    return backups.sort((a, b) => b.name.localeCompare(a.name))
  }

  /** Makes a backup now; concurrent calls share the one in progress. */
  create(): Promise<Backup> {
    this.running ??= this.write().finally(() => {
      this.running = undefined
    })
    return this.running
  }

  /** The file of a backup, for downloading. Only names Crystal wrote are accepted. */
  path(name: string): string {
    if (!createdAtOf(name)) throw notFound()
    return join(this.config.directory, name)
  }

  /** Checks every hour whether a backup is due. Does nothing when backups are off. */
  start(): void {
    if (this.config.intervalHours === 0) return
    const check = () => {
      void this.backupIfDue().catch((error: unknown) => {
        this.logger.error({ err: error }, 'Automatic backup failed')
      })
    }
    this.firstCheck = setTimeout(check, FIRST_CHECK_MS)
    this.firstCheck.unref()
    this.timer = setInterval(check, Math.min(HOUR_MS, this.config.intervalHours * HOUR_MS))
    this.timer.unref()
  }

  async stop(): Promise<void> {
    clearTimeout(this.firstCheck)
    clearInterval(this.timer)
    await this.running?.catch(() => undefined)
  }

  /** Makes a backup if the newest one is older than the interval. Returns it, if made. */
  async backupIfDue(): Promise<Backup | undefined> {
    const [latest] = await this.list()
    const age = latest ? this.now().getTime() - Date.parse(latest.createdAt) : Infinity
    // A few minutes of leeway, so hourly checks do not drift a full hour.
    if (age < this.config.intervalHours * HOUR_MS - 5 * 60 * 1000) return undefined
    return this.create()
  }

  private async write(): Promise<Backup> {
    const createdAt = new Date(Math.floor(this.now().getTime() / 1000) * 1000)
    const name = `crystal-${createdAt
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z')
      .replace(/:/g, '-')}.db`
    const target = join(this.config.directory, name)
    const partial = `${target}.partial`
    await mkdir(this.config.directory, { recursive: true })
    try {
      await this.db.$client.backup(partial)
      // Only complete files get the final name.
      await rename(partial, target)
    } catch (error) {
      await rm(partial, { force: true })
      throw error
    }
    await this.prune()
    const info = await stat(target)
    this.logger.info({ backup: name, size: info.size }, 'Backup created')
    return { name, size: info.size, createdAt: createdAt.toISOString() }
  }

  private async prune(): Promise<void> {
    const backups = await this.list()
    for (const old of backups.slice(this.config.retention)) {
      await rm(join(this.config.directory, old.name), { force: true })
    }
  }
}

function createdAtOf(name: string): Date | null {
  const match = NAME.exec(name)
  if (!match) return null
  const date = new Date(`${match[1]}T${match[2]}:${match[3]}:${match[4]}Z`)
  return Number.isNaN(date.getTime()) ? null : date
}
