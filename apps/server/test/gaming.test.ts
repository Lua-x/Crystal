import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import type { AuthConfig, CrystalExport, List, Task } from '@crystal/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { instance } from '../src/db/schema.js'
import {
  createInvite,
  createTestContext,
  errorCode,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
let dataDir: string | undefined
afterEach(async () => {
  await context.close()
  if (dataDir) rmSync(dataDir, { recursive: true, force: true })
  dataDir = undefined
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3])
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46])
const PDF = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n')

function setup(env: Record<string, string> = {}) {
  dataDir = mkdtempSync(join(tmpdir(), 'crystal-gaming-'))
  context = createTestContext({ REGISTRATION: 'open', DATA_DIR: dataDir, ...env })
  return context
}

/** The stored image files. */
function imageFiles(): string[] {
  const directory = join(dataDir!, 'images')
  return existsSync(directory) ? readdirSync(directory) : []
}

async function authConfig(client: TestClient) {
  return (await client.get<AuthConfig>('/api/v1/auth/config')).body
}

function setCover(client: TestClient, listId: string, content: Uint8Array) {
  return client.upload<List>(
    `/api/v1/lists/${listId}/cover`,
    { file: new Blob([Buffer.from(content)]) },
    'cover.png',
    'PUT',
  )
}

describe('instance mode', () => {
  it('is chosen with the first account and fixed from then on', async () => {
    setup()
    const visitor = context.client()
    expect(await authConfig(visitor)).toMatchObject({ needsSetup: true, mode: null })

    await registerUser(context, 'anna', { mode: 'gaming' })
    expect(await authConfig(visitor)).toMatchObject({ needsSetup: false, mode: 'gaming' })

    // Later accounts cannot change it.
    await registerUser(context, 'ben', { mode: 'standard' })
    expect((await authConfig(visitor)).mode).toBe('gaming')
  })

  it('is the everyday mode when the first account does not choose', async () => {
    setup()
    await registerUser(context, 'anna')
    expect((await authConfig(context.client())).mode).toBe('standard')
  })

  it('names the default list after the mode', async () => {
    setup({ REGISTRATION: 'invite' })
    const { client: anna } = await registerUser(context, 'anna', { mode: 'gaming', locale: 'de' })
    const [annaDefault] = (await anna.get<List[]>('/api/v1/lists')).body
    expect(annaDefault).toMatchObject({ name: 'Allgemein', isDefault: true })

    const token = await createInvite(anna)
    const { client: ben } = await registerUser(context, 'ben', { inviteToken: token })
    const [benDefault] = (await ben.get<List[]>('/api/v1/lists')).body
    expect(benDefault).toMatchObject({ name: 'General', isDefault: true })
  })

  it('keeps existing instances in the everyday mode after the update', async () => {
    setup()
    await registerUser(context, 'anna', { mode: 'gaming' })
    const sqlite = context.services.db.$client
    context.services.db.delete(instance).run()

    // The data statement of the migration, as it runs on an instance from before modes.
    const migration = readFileSync(
      fileURLToPath(new URL('../drizzle/0010_gaming.sql', import.meta.url)),
      'utf8',
    )
    const statement = migration.split('--> statement-breakpoint').at(-1)!
    sqlite.exec(statement)
    expect(context.services.db.select().from(instance).all()).toEqual([
      expect.objectContaining({ id: 1, mode: 'standard' }),
    ])
  })

  it('leaves new instances without a mode until setup', async () => {
    setup()
    const migration = readFileSync(
      fileURLToPath(new URL('../drizzle/0010_gaming.sql', import.meta.url)),
      'utf8',
    )
    context.services.db.$client.exec(migration.split('--> statement-breakpoint').at(-1)!)
    expect(context.services.db.select().from(instance).all()).toEqual([])
    expect((await authConfig(context.client())).mode).toBeNull()
  })
})

describe('games', () => {
  it('have a deadline and show their progress', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const created = await client.post<List>('/api/v1/lists', {
      name: 'Hollow Knight',
      deadline: '2026-12-24',
    })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({
      deadline: '2026-12-24',
      coverImageId: null,
      openCount: 0,
      completedCount: 0,
    })

    const listId = created.body.id
    const goals: Task[] = []
    for (const title of ['Defeat the Hornet', 'Find all grubs', 'Reach Dirtmouth']) {
      goals.push((await client.post<Task>('/api/v1/tasks', { listId, title })).body)
    }
    await client.patch(`/api/v1/tasks/${goals[2]!.id}`, { completed: true })
    const deleted = (await client.post<Task>('/api/v1/tasks', { listId, title: 'Typo' })).body
    await client.patch(`/api/v1/tasks/${deleted.id}`, { completed: true })
    await client.delete(`/api/v1/tasks/${deleted.id}`)

    const game = (await client.get<List[]>('/api/v1/lists')).body.find((list) => list.id === listId)
    expect(game).toMatchObject({ openCount: 2, completedCount: 1 })

    const moved = await client.patch<List>(`/api/v1/lists/${listId}`, { deadline: '2027-01-06' })
    expect(moved.body.deadline).toBe('2027-01-06')
    const cleared = await client.patch<List>(`/api/v1/lists/${listId}`, { deadline: null })
    expect(cleared.body.deadline).toBeNull()

    const invalid = await client.patch(`/api/v1/lists/${listId}`, { deadline: '24.12.2026' })
    expect(invalid.status).toBe(400)
  })

  it('lets only the owner change the deadline', async () => {
    setup()
    const { client: anna } = await registerUser(context, 'anna', { mode: 'gaming' })
    const { client: ben, me: benMe } = await registerUser(context, 'ben')
    const game = (await anna.post<List>('/api/v1/lists', { name: 'Stardew Valley' })).body
    await anna.post(`/api/v1/lists/${game.id}/members`, { userId: benMe.id, role: 'editor' })

    const attempt = await ben.patch(`/api/v1/lists/${game.id}`, { deadline: '2026-11-01' })
    expect(attempt.status).toBe(403)
  })

  it('keep their deadline through export and import', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    await client.post<List>('/api/v1/lists', { name: 'Celeste', deadline: '2026-10-31' })

    const exported = (await client.get<CrystalExport>('/api/v1/export')).body
    expect(exported.lists.find((list) => list.name === 'Celeste')?.deadline).toBe('2026-10-31')

    const imported = await client.post('/api/v1/import', {
      format: 'crystal',
      content: JSON.stringify(exported),
    })
    expect(imported.status).toBe(201)
    const lists = (await client.get<List[]>('/api/v1/lists')).body
    expect(lists.filter((list) => list.name === 'Celeste').map((list) => list.deadline)).toEqual([
      '2026-10-31',
      '2026-10-31',
    ])
  })
})

describe('covers', () => {
  it('are stored as images everyone on the list can see', async () => {
    setup()
    const { client: anna } = await registerUser(context, 'anna', { mode: 'gaming' })
    const { client: ben, me: benMe } = await registerUser(context, 'ben')
    const { client: cleo } = await registerUser(context, 'cleo')
    const game = (await anna.post<List>('/api/v1/lists', { name: 'Hades' })).body

    const uploaded = await setCover(anna, game.id, PNG)
    expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(200)
    const coverId = uploaded.body.coverImageId!
    expect(coverId).toMatch(/^[0-9a-f-]{36}$/)
    expect(imageFiles()).toEqual([coverId])

    const shown = await anna.download(`/api/v1/images/${coverId}`)
    expect(shown.status).toBe(200)
    expect([...shown.bytes]).toEqual([...PNG])
    expect(shown.headers.get('content-type')).toBe('image/png')
    expect(shown.headers.get('cache-control')).toBe('private, max-age=31536000, immutable')
    expect(shown.headers.get('content-security-policy')).toContain('sandbox')
    expect(shown.headers.get('x-content-type-options')).toBe('nosniff')

    // Only people with access to the list see it.
    expect((await ben.download(`/api/v1/images/${coverId}`)).status).toBe(404)
    await anna.post(`/api/v1/lists/${game.id}/members`, { userId: benMe.id, role: 'viewer' })
    expect((await ben.download(`/api/v1/images/${coverId}`)).status).toBe(200)
    expect((await cleo.download(`/api/v1/images/${coverId}`)).status).toBe(404)
    expect((await context.client().download(`/api/v1/images/${coverId}`)).status).toBe(401)
  })

  it('replace the previous cover and can be removed', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const game = (await client.post<List>('/api/v1/lists', { name: 'Hades' })).body
    const first = (await setCover(client, game.id, PNG)).body.coverImageId!

    const second = await setCover(client, game.id, JPEG)
    const secondId = second.body.coverImageId!
    expect(secondId).not.toBe(first)
    expect((await client.download(`/api/v1/images/${first}`)).status).toBe(404)
    expect(imageFiles()).toEqual([secondId])
    const shown = await client.download(`/api/v1/images/${secondId}`)
    expect(shown.headers.get('content-type')).toBe('image/jpeg')

    const removed = await client.delete<List>(`/api/v1/lists/${game.id}/cover`)
    expect(removed.status).toBe(200)
    expect(removed.body.coverImageId).toBeNull()
    expect((await client.download(`/api/v1/images/${secondId}`)).status).toBe(404)
    expect(imageFiles()).toEqual([])
  })

  it('must be images and may only be set by the owner', async () => {
    setup()
    const { client: anna } = await registerUser(context, 'anna', { mode: 'gaming' })
    const { client: ben, me: benMe } = await registerUser(context, 'ben')
    const game = (await anna.post<List>('/api/v1/lists', { name: 'Hades' })).body
    await anna.post(`/api/v1/lists/${game.id}/members`, { userId: benMe.id, role: 'editor' })

    const pdf = await setCover(anna, game.id, PDF)
    expect(pdf.status).toBe(400)
    expect(errorCode(pdf)).toBe('unsupported_file')

    const byEditor = await setCover(ben, game.id, PNG)
    expect(byEditor.status).toBe(403)
    expect(imageFiles()).toEqual([])

    const huge = new Uint8Array(5 * 1024 * 1024 + 1)
    huge.set(PNG)
    const tooLarge = await setCover(anna, game.id, huge)
    expect(tooLarge.status).toBe(413)
  })

  it('are cleaned up with their list', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const game = (await client.post<List>('/api/v1/lists', { name: 'Hades' })).body
    const coverId = (await setCover(client, game.id, PNG)).body.coverImageId!

    await client.delete(`/api/v1/lists/${game.id}`)
    expect((await client.download(`/api/v1/images/${coverId}`)).status).toBe(404)

    // Once the list is gone for good, its images follow; the files a little later.
    context.clock.advance(31 * 24 * 60 * 60 * 1000)
    context.services.cleanup.run()
    // Fresh files are left alone: they may still be about to be recorded.
    expect(await context.services.images.removeOrphans()).toBe(0)
    const later = Date.now() + 2 * 60 * 60 * 1000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    try {
      expect(await context.services.images.removeOrphans()).toBe(1)
    } finally {
      vi.restoreAllMocks()
    }
    expect(imageFiles()).toEqual([])
  })
})
