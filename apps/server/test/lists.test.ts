import type { List, ListGroup, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { lists, tasks } from '../src/db/schema.js'
import {
  createTestContext,
  errorCode,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

async function setup(locale = 'en') {
  context = createTestContext({ REGISTRATION: 'open' })
  const { client } = await registerUser(context, 'anna', { locale, timezone: 'Europe/Berlin' })
  return client
}

async function sidebar(client: TestClient) {
  const lists = (await client.get<List[]>('/api/v1/lists')).body
  const groups = (await client.get<ListGroup[]>('/api/v1/list-groups')).body
  return { lists, groups }
}

async function createList(client: TestClient, name: string, extra: Record<string, unknown> = {}) {
  const response = await client.post<List>('/api/v1/lists', { name, ...extra })
  expect(response.status).toBe(201)
  return response.body
}

/** Top-level sidebar order (groups and ungrouped lists) as names. */
function topLevelNames({ lists, groups }: { lists: List[]; groups: ListGroup[] }) {
  return [
    ...groups.map((group) => ({ name: `[${group.name}]`, position: group.position })),
    ...lists
      .filter((list) => !list.groupId)
      .map((list) => ({ name: list.name, position: list.position })),
  ]
    .sort((a, b) => (a.position < b.position ? -1 : 1))
    .map((item) => item.name)
}

describe('default list', () => {
  it('is created on first use, in the user language', async () => {
    const client = await setup('de')
    const { lists } = await sidebar(client)
    expect(lists).toHaveLength(1)
    expect(lists[0]).toMatchObject({
      name: 'Aufgaben',
      isDefault: true,
      role: 'owner',
      openCount: 0,
    })

    // Only once.
    expect((await sidebar(client)).lists).toHaveLength(1)
  })

  it('cannot be deleted', async () => {
    const client = await setup()
    const [tasks] = (await sidebar(client)).lists
    const response = await client.delete(`/api/v1/lists/${tasks!.id}`)
    expect(response.status).toBe(409)
    expect(errorCode(response)).toBe('list_is_default')
  })

  it('receives tasks created without a list', async () => {
    const client = await setup()
    const task = (await client.post<Task>('/api/v1/tasks', { title: 'Buy milk' })).body
    const [defaultList] = (await sidebar(client)).lists
    expect(task.listId).toBe(defaultList!.id)
    expect(defaultList!.openCount).toBe(1)
  })
})

describe('lists', () => {
  it('creates, renames and recolors lists', async () => {
    const client = await setup()
    const list = await createList(client, 'Household', { color: 'green', icon: '🏠' })
    expect(list).toMatchObject({ name: 'Household', color: 'green', icon: '🏠', isDefault: false })

    const updated = await client.patch<List>(`/api/v1/lists/${list.id}`, {
      name: 'Home',
      color: 'orange',
      icon: null,
    })
    expect(updated.body).toMatchObject({ name: 'Home', color: 'orange', icon: null })
  })

  it('appends new lists and reorders them', async () => {
    const client = await setup()
    await sidebar(client) // creates "Tasks"
    const a = await createList(client, 'A')
    await createList(client, 'B')
    const c = await createList(client, 'C')
    expect(topLevelNames(await sidebar(client))).toEqual(['Tasks', 'A', 'B', 'C'])

    await client.patch(`/api/v1/lists/${c.id}`, { placement: { groupId: null, after: null } })
    expect(topLevelNames(await sidebar(client))).toEqual(['C', 'Tasks', 'A', 'B'])

    await client.patch(`/api/v1/lists/${c.id}`, { placement: { groupId: null, after: a.id } })
    expect(topLevelNames(await sidebar(client))).toEqual(['Tasks', 'A', 'C', 'B'])
  })

  it('rejects placement after an item that is not there', async () => {
    const client = await setup()
    const a = await createList(client, 'A')
    const response = await client.patch(`/api/v1/lists/${a.id}`, {
      placement: { groupId: null, after: '01a0e479-47e2-7411-86ad-42eecdbb7fcd' },
    })
    expect(response.status).toBe(400)
  })

  it('deletes a list together with its tasks', async () => {
    const client = await setup()
    const list = await createList(client, 'Trip')
    await client.post('/api/v1/tasks', { listId: list.id, title: 'Passport', important: true })

    expect((await client.delete(`/api/v1/lists/${list.id}`)).status).toBe(204)
    expect((await sidebar(client)).lists.map((item) => item.name)).toEqual(['Tasks'])
    expect((await client.get(`/api/v1/lists/${list.id}/tasks`)).status).toBe(404)
    expect((await client.get<Task[]>('/api/v1/views/important')).body).toHaveLength(0)
  })

  it('deletes all completed tasks of a list', async () => {
    const client = await setup()
    const list = await createList(client, 'Chores')
    const done = (await client.post<Task>('/api/v1/tasks', { listId: list.id, title: 'Dishes' }))
      .body
    await client.post('/api/v1/tasks', { listId: list.id, title: 'Laundry' })
    await client.patch(`/api/v1/tasks/${done.id}`, { completed: true })

    const response = await client.delete<{ deleted: number }>(`/api/v1/lists/${list.id}/completed`)
    expect(response.body.deleted).toBe(1)
    const remaining = (await client.get<Task[]>(`/api/v1/lists/${list.id}/tasks`)).body
    expect(remaining.map((task) => task.title)).toEqual(['Laundry'])
  })

  it('validates names and colors', async () => {
    const client = await setup()
    expect((await client.post('/api/v1/lists', { name: '  ' })).status).toBe(400)
    expect((await client.post('/api/v1/lists', { name: 'X', color: 'chartreuse' })).status).toBe(
      400,
    )
  })
})

describe('groups', () => {
  it('holds lists and keeps its own order', async () => {
    const client = await setup()
    await sidebar(client)
    const group = (await client.post<ListGroup>('/api/v1/list-groups', { name: 'Family' })).body
    const a = await createList(client, 'Groceries', { groupId: group.id })
    const b = await createList(client, 'Birthdays', { groupId: group.id })
    await createList(client, 'Work')

    let state = await sidebar(client)
    expect(topLevelNames(state)).toEqual(['Tasks', '[Family]', 'Work'])
    expect(
      state.lists.filter((list) => list.groupId === group.id).map((list) => list.name),
    ).toEqual(['Groceries', 'Birthdays'])

    await client.patch(`/api/v1/lists/${b.id}`, { placement: { groupId: group.id, after: null } })
    state = await sidebar(client)
    expect(
      state.lists.filter((list) => list.groupId === group.id).map((list) => list.name),
    ).toEqual(['Birthdays', 'Groceries'])

    // Moving a list out of the group, to the very top.
    await client.patch(`/api/v1/lists/${a.id}`, { placement: { groupId: null, after: null } })
    expect(topLevelNames(await sidebar(client))).toEqual(['Groceries', 'Tasks', '[Family]', 'Work'])
  })

  it('renames, collapses, moves and deletes groups', async () => {
    const client = await setup()
    await sidebar(client)
    const group = (await client.post<ListGroup>('/api/v1/list-groups', { name: 'Old' })).body
    await createList(client, 'Inside', { groupId: group.id })
    const work = await createList(client, 'Work')

    const updated = await client.patch<ListGroup>(`/api/v1/list-groups/${group.id}`, {
      name: 'New',
      collapsed: true,
      placement: { after: work.id },
    })
    expect(updated.body).toMatchObject({ name: 'New', collapsed: true })
    expect(topLevelNames(await sidebar(client))).toEqual(['Tasks', 'Work', '[New]'])

    // The lists of a deleted group take its place at the top level.
    expect((await client.delete(`/api/v1/list-groups/${group.id}`)).status).toBe(204)
    expect(topLevelNames(await sidebar(client))).toEqual(['Tasks', 'Work', 'Inside'])
  })
})

describe('isolation', () => {
  it('never shows or changes lists of other users', async () => {
    const anna = await setup()
    const list = await createList(anna, 'Private')
    const task = (await anna.post<Task>('/api/v1/tasks', { listId: list.id, title: 'Secret' })).body
    const group = (await anna.post<ListGroup>('/api/v1/list-groups', { name: 'Mine' })).body

    const { client: ben } = await registerUser(context, 'ben')
    expect((await sidebar(ben)).lists.map((item) => item.name)).toEqual(['Tasks'])
    expect((await sidebar(ben)).groups).toEqual([])

    for (const response of [
      await ben.get(`/api/v1/lists/${list.id}/tasks`),
      await ben.patch(`/api/v1/lists/${list.id}`, { name: 'Mine now' }),
      await ben.delete(`/api/v1/lists/${list.id}`),
      await ben.post('/api/v1/tasks', { listId: list.id, title: 'Intruder' }),
      await ben.get(`/api/v1/tasks/${task.id}`),
      await ben.patch(`/api/v1/tasks/${task.id}`, { title: 'Changed' }),
      await ben.patch(`/api/v1/tasks/${task.id}`, { myDay: true }),
      await ben.delete(`/api/v1/tasks/${task.id}`),
      await ben.post(`/api/v1/tasks/${task.id}/subtasks`, { title: 'Step' }),
      await ben.patch(`/api/v1/list-groups/${group.id}`, { name: 'Taken' }),
      await ben.delete(`/api/v1/list-groups/${group.id}`),
    ]) {
      expect(response.status).toBe(404)
    }

    const benTask = (await ben.post<Task>('/api/v1/tasks', { title: 'Mine' })).body
    const move = await ben.patch(`/api/v1/tasks/${benTask.id}`, {
      placement: { listId: list.id, after: null },
    })
    expect(move.status).toBe(404)

    for (const view of ['my-day', 'important', 'planned', 'overdue', 'all', 'completed']) {
      const tasks = (await ben.get<Task[]>(`/api/v1/views/${view}`)).body
      expect(tasks.some((item) => item.id === task.id)).toBe(false)
    }
    expect((await ben.get<Task[]>('/api/v1/search?q=secret')).body).toEqual([])
  })

  it('removes the lists of a deleted account', async () => {
    const admin = await setup()
    const { client: ben, me } = await registerUser(context, 'ben')
    await createList(ben, 'Groceries')
    await ben.post('/api/v1/tasks', { title: 'Something' })
    expect(context.services.db.select().from(lists).all()).toHaveLength(2)

    expect((await admin.delete(`/api/v1/admin/users/${me.id}`)).status).toBe(204)
    expect(context.services.db.select().from(lists).all()).toHaveLength(0)
    expect(context.services.db.select().from(tasks).all()).toHaveLength(0)
  })
})
