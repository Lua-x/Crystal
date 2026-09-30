import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { GameMap, List, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createTestContext,
  errorCode,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
let dataDir: string
afterEach(async () => {
  await context.close()
  rmSync(dataDir, { recursive: true, force: true })
})

/** A PNG header for a 4096 × 2304 picture; enough for Crystal to store and measure it. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0x10,
  0, 0, 0, 0x09, 0, 8, 2, 0, 0, 0,
])
const AVIF = new Uint8Array([
  0,
  0,
  0,
  20,
  ...'ftypavif'.split('').map((c) => c.charCodeAt(0)),
  0,
  0,
  0,
  0,
  0x6d,
  0x69,
  0x66,
  0x31,
])

function setup(env: Record<string, string> = {}) {
  dataDir = mkdtempSync(join(tmpdir(), 'crystal-maps-'))
  context = createTestContext({ REGISTRATION: 'open', DATA_DIR: dataDir, ...env })
}

function addMap(client: TestClient, listId: string, name: string, content = PNG) {
  const form = { file: new Blob([Buffer.from(content)]), name }
  return client.upload<GameMap>(`/api/v1/lists/${listId}/maps`, form, 'map.png')
}

async function game(client: TestClient, name = 'Hollow Knight') {
  return (await client.post<List>('/api/v1/lists', { name })).body
}

async function goal(client: TestClient, listId: string, title: string) {
  return (await client.post<Task>('/api/v1/tasks', { listId, title })).body
}

describe('maps', () => {
  it('belong to a game, in the order they were added', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const knight = await game(client)

    const hallownest = await addMap(client, knight.id, 'Hallownest')
    expect(hallownest.status, JSON.stringify(hallownest.body)).toBe(201)
    expect(hallownest.body).toMatchObject({
      listId: knight.id,
      name: 'Hallownest',
      width: 4096,
      height: 2304,
    })
    // Pictures whose size Crystal cannot read still work; the app measures them.
    const abyss = await addMap(client, knight.id, 'The Abyss', AVIF)
    expect(abyss.body).toMatchObject({ width: null, height: null })

    const listed = await client.get<GameMap[]>(`/api/v1/lists/${knight.id}/maps`)
    expect(listed.body.map((map) => map.name)).toEqual(['Hallownest', 'The Abyss'])
    const picture = await client.download(`/api/v1/images/${hallownest.body.imageId}`)
    expect(picture.headers.get('content-type')).toBe('image/png')
  })

  it('can be renamed and removed by people who can edit the game', async () => {
    setup()
    const { client: anna } = await registerUser(context, 'anna', { mode: 'gaming' })
    const { client: ben, me: benMe } = await registerUser(context, 'ben')
    const { client: cleo } = await registerUser(context, 'cleo')
    const knight = await game(anna)
    const map = (await addMap(anna, knight.id, 'Hallownest')).body

    expect((await cleo.get(`/api/v1/lists/${knight.id}/maps`)).status).toBe(404)
    expect((await cleo.patch(`/api/v1/maps/${map.id}`, { name: 'Mine' })).status).toBe(404)

    await anna.post(`/api/v1/lists/${knight.id}/members`, { userId: benMe.id, role: 'viewer' })
    expect((await ben.get<GameMap[]>(`/api/v1/lists/${knight.id}/maps`)).body).toHaveLength(1)
    expect((await ben.patch(`/api/v1/maps/${map.id}`, { name: 'Mine' })).status).toBe(403)
    expect((await addMap(ben, knight.id, 'Greenpath')).status).toBe(403)

    await anna.patch(`/api/v1/lists/${knight.id}/members/${benMe.id}`, { role: 'editor' })
    const renamed = await ben.patch<GameMap>(`/api/v1/maps/${map.id}`, {
      name: 'Hallownest (full)',
    })
    expect(renamed.body.name).toBe('Hallownest (full)')

    expect((await ben.delete(`/api/v1/maps/${map.id}`)).status).toBe(204)
    expect((await anna.get<GameMap[]>(`/api/v1/lists/${knight.id}/maps`)).body).toEqual([])
    expect((await anna.download(`/api/v1/images/${map.imageId}`)).status).toBe(404)
  })

  it('must be pictures, of a sensible size and number', async () => {
    setup({ MAP_MAX_MB: '1' })
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const knight = await game(client)

    const text = await addMap(client, knight.id, 'Notes', new TextEncoder().encode('hello'))
    expect(errorCode(text)).toBe('unsupported_file')
    const huge = new Uint8Array(1024 * 1024 + 1)
    huge.set(PNG)
    expect((await addMap(client, knight.id, 'Huge', huge)).status).toBe(413)
    const unnamed = await addMap(client, knight.id, '  ')
    expect(unnamed.status).toBe(400)

    for (let index = 0; index < 20; index++) {
      expect((await addMap(client, knight.id, `Area ${index}`)).status).toBe(201)
    }
    const oneTooMany = await addMap(client, knight.id, 'Area 21')
    expect(oneTooMany.status).toBe(409)
    expect(errorCode(oneTooMany)).toBe('too_many_maps')
  })
})

describe('pins', () => {
  it('put goals on a map of their game', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const knight = await game(client)
    const map = (await addMap(client, knight.id, 'Hallownest')).body
    const grub = await goal(client, knight.id, 'Grub in Greenpath')
    expect(grub.pin).toBeNull()

    const pinned = await client.patch<Task>(`/api/v1/tasks/${grub.id}`, {
      pin: { mapId: map.id, x: 0.25, y: 0.75 },
    })
    expect(pinned.body.pin).toEqual({ mapId: map.id, x: 0.25, y: 0.75 })
    const moved = await client.patch<Task>(`/api/v1/tasks/${grub.id}`, {
      pin: { mapId: map.id, x: 0.3, y: 0.7 },
    })
    expect(moved.body.pin).toEqual({ mapId: map.id, x: 0.3, y: 0.7 })

    const removed = await client.patch<Task>(`/api/v1/tasks/${grub.id}`, { pin: null })
    expect(removed.body.pin).toBeNull()
  })

  it('stay inside the map and its game', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const knight = await game(client)
    const celeste = await game(client, 'Celeste')
    const summit = (await addMap(client, celeste.id, 'Summit')).body
    const grub = await goal(client, knight.id, 'Grub')

    const elsewhere = await client.patch(`/api/v1/tasks/${grub.id}`, {
      pin: { mapId: summit.id, x: 0.5, y: 0.5 },
    })
    expect(elsewhere.status).toBe(400)
    const outside = await client.patch(`/api/v1/tasks/${grub.id}`, {
      pin: { mapId: summit.id, x: 1.5, y: 0.5 },
    })
    expect(outside.status).toBe(400)
  })

  it('go when the goal moves to another game or the map is removed', async () => {
    setup()
    const { client } = await registerUser(context, 'anna', { mode: 'gaming' })
    const knight = await game(client)
    const celeste = await game(client, 'Celeste')
    const map = (await addMap(client, knight.id, 'Hallownest')).body
    const first = await goal(client, knight.id, 'Grub one')
    const second = await goal(client, knight.id, 'Grub two')
    for (const item of [first, second]) {
      await client.patch(`/api/v1/tasks/${item.id}`, { pin: { mapId: map.id, x: 0.5, y: 0.5 } })
    }

    const moved = await client.patch<Task>(`/api/v1/tasks/${first.id}`, {
      placement: { listId: celeste.id, after: null },
    })
    expect(moved.body.pin).toBeNull()

    await client.delete(`/api/v1/maps/${map.id}`)
    const left = (await client.get<Task>(`/api/v1/tasks/${second.id}`)).body
    expect(left.pin).toBeNull()
    expect(left.title).toBe('Grub two')
  })

  it('can only be set by people who can edit the game', async () => {
    setup()
    const { client: anna } = await registerUser(context, 'anna', { mode: 'gaming' })
    const { client: ben, me: benMe } = await registerUser(context, 'ben')
    const knight = await game(anna)
    const map = (await addMap(anna, knight.id, 'Hallownest')).body
    const grub = await goal(anna, knight.id, 'Grub')
    await anna.post(`/api/v1/lists/${knight.id}/members`, { userId: benMe.id, role: 'viewer' })

    const attempt = await ben.patch(`/api/v1/tasks/${grub.id}`, {
      pin: { mapId: map.id, x: 0.5, y: 0.5 },
    })
    expect(attempt.status).toBe(403)
  })
})
