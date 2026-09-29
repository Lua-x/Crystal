import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Backup, BackupStatus } from '@crystal/shared'
import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { createTestContext, registerUser, type TestContext } from './helpers.js'

let context: TestContext
let directory: string
afterEach(async () => {
  await context.close()
  rmSync(directory, { recursive: true, force: true })
})

function setup(env: Record<string, string> = {}) {
  directory = mkdtempSync(join(tmpdir(), 'crystal-backups-'))
  context = createTestContext({ REGISTRATION: 'open', BACKUP_DIR: directory, ...env })
}

describe('backups', () => {
  it('backs up the database while running, lists and downloads backups', async () => {
    setup()
    const admin = await registerUser(context, 'anna')
    await admin.client.post('/api/v1/tasks', { title: 'Keep me safe' })

    const empty = await admin.client.get<BackupStatus>('/api/v1/admin/backups')
    expect(empty.body).toEqual({
      intervalHours: 24,
      retention: 7,
      directory,
      backups: [],
    })

    const created = await admin.client.post<Backup>('/api/v1/admin/backups')
    expect(created.status).toBe(201)
    expect(created.body.name).toBe('crystal-2026-09-27T10-00-00Z.db')
    expect(created.body.size).toBeGreaterThan(0)
    // Only complete files are left behind.
    expect(readdirSync(directory)).toEqual([created.body.name])

    // The backup is a working database with the data in it.
    const copy = new Database(join(directory, created.body.name), { readonly: true })
    const titles = copy.prepare('select title from tasks').all() as { title: string }[]
    copy.close()
    expect(titles.map((row) => row.title)).toContain('Keep me safe')

    const download = await admin.client.get<string>(`/api/v1/admin/backups/${created.body.name}`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-type')).toBe('application/vnd.sqlite3')
    expect(download.headers.get('content-disposition')).toBe(
      `attachment; filename="${created.body.name}"`,
    )
    expect(download.body.startsWith('SQLite format 3')).toBe(true)
  })

  it('keeps only the newest backups', async () => {
    setup({ BACKUP_RETENTION: '2' })
    const admin = await registerUser(context, 'anna')
    for (let index = 0; index < 3; index++) {
      await admin.client.post('/api/v1/admin/backups')
      context.clock.advance(60 * 60 * 1000)
    }
    const status = (await admin.client.get<BackupStatus>('/api/v1/admin/backups')).body
    expect(status.backups.map((backup) => backup.name)).toEqual([
      'crystal-2026-09-27T12-00-00Z.db',
      'crystal-2026-09-27T11-00-00Z.db',
    ])
  })

  it('backs up automatically once the interval has passed', async () => {
    setup({ BACKUP_INTERVAL_HOURS: '6' })
    const { backups } = context.services
    expect(await backups.backupIfDue()).toBeDefined()
    context.clock.advance(3 * 60 * 60 * 1000)
    expect(await backups.backupIfDue()).toBeUndefined()
    context.clock.advance(3 * 60 * 60 * 1000)
    expect(await backups.backupIfDue()).toBeDefined()
    expect(await backups.list()).toHaveLength(2)
  })

  it('only serves backup files, to administrators', async () => {
    setup()
    const admin = await registerUser(context, 'anna')
    const member = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    writeFileSync(join(directory, 'secret.txt'), 'not a backup')
    for (const name of ['secret.txt', '..%2Fsecret.txt', 'crystal-2026-01-01T00-00-00Z.db']) {
      expect((await admin.client.get(`/api/v1/admin/backups/${name}`)).status).toBe(404)
    }
    expect((await member.client.get('/api/v1/admin/backups')).status).toBe(403)
    expect((await member.client.post('/api/v1/admin/backups')).status).toBe(403)
    expect(readFileSync(join(directory, 'secret.txt'), 'utf8')).toBe('not a backup')
  })
})
