import type { List, Task } from '@crystal/shared'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'

import { tasks } from '../src/db/schema.js'
import {
  createTestContext,
  errorCode,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

async function setup() {
  context = createTestContext()
  const { client } = await registerUser(context, 'anna', { timezone: 'Europe/Berlin' })
  const list = (await client.post<List>('/api/v1/lists', { name: 'Household' })).body
  return { client, list }
}

async function createTask(client: TestClient, input: Record<string, unknown>) {
  const response = await client.post<Task>('/api/v1/tasks', input)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

async function titles(client: TestClient, listId: string) {
  return (await client.get<Task[]>(`/api/v1/lists/${listId}/tasks`)).body.map((task) => task.title)
}

describe('creating tasks', () => {
  it('adds new tasks at the top', async () => {
    const { client, list } = await setup()
    await createTask(client, { listId: list.id, title: 'First' })
    await createTask(client, { listId: list.id, title: 'Second' })
    expect(await titles(client, list.id)).toEqual(['Second', 'First'])
  })

  it('stores all fields', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, {
      listId: list.id,
      title: '  Take out the trash  ',
      notes: '**Yellow** bin',
      dueDate: '2026-09-28',
      dueTime: '18:00',
      important: true,
      priority: 2,
      myDay: true,
    })
    expect(task).toMatchObject({
      title: 'Take out the trash',
      notes: '**Yellow** bin',
      dueDate: '2026-09-28',
      dueTime: '18:00',
      important: true,
      priority: 2,
      inMyDay: true,
      completedAt: null,
      subtasks: [],
    })
  })

  it('accepts a client-generated ID once', async () => {
    const { client, list } = await setup()
    const id = '01a0e479-47e2-7411-86ad-42eecdbb7fcd'
    expect((await createTask(client, { id, listId: list.id, title: 'A' })).id).toBe(id)
    const duplicate = await client.post('/api/v1/tasks', { id, listId: list.id, title: 'B' })
    expect(duplicate.status).toBe(400)
  })

  it('validates input', async () => {
    const { client, list } = await setup()
    for (const body of [
      { listId: list.id, title: '' },
      { listId: list.id, title: 'x'.repeat(501) },
      { listId: list.id, title: 'A', dueDate: '2026-13-01' },
      { listId: list.id, title: 'A', dueTime: '18:00' },
      { listId: list.id, title: 'A', dueDate: '2026-09-28', dueTime: '25:00' },
      { listId: list.id, title: 'A', priority: 4 },
    ]) {
      const response = await client.post('/api/v1/tasks', body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      expect(errorCode(response)).toBe('validation_failed')
    }
  })
})

describe('updating tasks', () => {
  it('changes fields and keeps the time tied to the date', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Call mum' })

    const dated = await client.patch<Task>(`/api/v1/tasks/${task.id}`, {
      dueDate: '2026-10-01',
      dueTime: '09:30',
    })
    expect(dated.body).toMatchObject({ dueDate: '2026-10-01', dueTime: '09:30' })

    const cleared = await client.patch<Task>(`/api/v1/tasks/${task.id}`, { dueDate: null })
    expect(cleared.body).toMatchObject({ dueDate: null, dueTime: null })

    const timeOnly = await client.patch(`/api/v1/tasks/${task.id}`, { dueTime: '10:00' })
    expect(timeOnly.status).toBe(400)
  })

  it('completes and reopens tasks', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Water plants' })

    const done = await client.patch<Task>(`/api/v1/tasks/${task.id}`, { completed: true })
    expect(done.body.completedAt).toBe('2026-09-27T10:00:00.000Z')

    // Completing again keeps the original completion time.
    context.clock.advance(60_000)
    const again = await client.patch<Task>(`/api/v1/tasks/${task.id}`, { completed: true })
    expect(again.body.completedAt).toBe('2026-09-27T10:00:00.000Z')

    const reopened = await client.patch<Task>(`/api/v1/tasks/${task.id}`, { completed: false })
    expect(reopened.body.completedAt).toBeNull()
  })

  it('reorders tasks within a list', async () => {
    const { client, list } = await setup()
    const c = await createTask(client, { listId: list.id, title: 'C' })
    await createTask(client, { listId: list.id, title: 'B' })
    const a = await createTask(client, { listId: list.id, title: 'A' })
    expect(await titles(client, list.id)).toEqual(['A', 'B', 'C'])

    await client.patch(`/api/v1/tasks/${a.id}`, { placement: { after: c.id } })
    expect(await titles(client, list.id)).toEqual(['B', 'C', 'A'])

    await client.patch(`/api/v1/tasks/${c.id}`, { placement: { after: null } })
    expect(await titles(client, list.id)).toEqual(['C', 'B', 'A'])
  })

  it('repairs duplicate positions', async () => {
    const { client, list } = await setup()
    const a = await createTask(client, { listId: list.id, title: 'A' })
    const b = await createTask(client, { listId: list.id, title: 'B' })
    const c = await createTask(client, { listId: list.id, title: 'C' })
    // Simulate two tasks that ended up with the same key.
    const position = context.services.db.select().from(tasks).where(eq(tasks.id, b.id)).get()!
      .position
    context.services.db.update(tasks).set({ position }).where(eq(tasks.id, a.id)).run()

    const moved = await client.patch(`/api/v1/tasks/${c.id}`, { placement: { after: a.id } })
    expect(moved.status).toBe(200)
    const order = await titles(client, list.id)
    expect(order.indexOf('C')).toBe(order.indexOf('A') + 1)
  })

  it('moves tasks to another list', async () => {
    const { client, list } = await setup()
    const other = (await client.post<List>('/api/v1/lists', { name: 'Garden' })).body
    await createTask(client, { listId: other.id, title: 'Mow' })
    const task = await createTask(client, { listId: list.id, title: 'Rake leaves' })

    const moved = await client.patch<Task>(`/api/v1/tasks/${task.id}`, {
      placement: { listId: other.id, after: null },
    })
    expect(moved.body.listId).toBe(other.id)
    expect(await titles(client, list.id)).toEqual([])
    expect(await titles(client, other.id)).toEqual(['Rake leaves', 'Mow'])
  })

  it('adds to and removes from My Day', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Laundry' })
    expect(
      (await client.patch<Task>(`/api/v1/tasks/${task.id}`, { myDay: true })).body.inMyDay,
    ).toBe(true)
    expect(
      (await client.patch<Task>(`/api/v1/tasks/${task.id}`, { myDay: false })).body.inMyDay,
    ).toBe(false)
  })
})

describe('deleting tasks', () => {
  it('moves tasks to the trash and restores them', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Oops' })

    expect((await client.delete(`/api/v1/tasks/${task.id}`)).status).toBe(204)
    expect(await titles(client, list.id)).toEqual([])
    expect((await client.get(`/api/v1/tasks/${task.id}`)).status).toBe(404)

    const restored = await client.post<Task>(`/api/v1/tasks/${task.id}/restore`)
    expect(restored.status).toBe(200)
    expect(await titles(client, list.id)).toEqual(['Oops'])
  })

  it('removes the trash for good after 30 days', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Old' })
    await client.delete(`/api/v1/tasks/${task.id}`)

    context.clock.advance(29 * 24 * 60 * 60 * 1000)
    expect(context.services.cleanup.run().tasks).toBe(0)

    context.clock.advance(2 * 24 * 60 * 60 * 1000)
    expect(context.services.cleanup.run().tasks).toBe(1)
    expect(
      context.services.db.select().from(tasks).where(eq(tasks.id, task.id)).get(),
    ).toBeUndefined()
  })
})

describe('subtasks', () => {
  it('adds, completes, renames, reorders and deletes subtasks', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Pack for the trip' })

    const first = await client.post<Task>(`/api/v1/tasks/${task.id}/subtasks`, { title: 'Socks' })
    expect(first.status).toBe(201)
    let current = (
      await client.post<Task>(`/api/v1/tasks/${task.id}/subtasks`, { title: 'Charger' })
    ).body
    expect(current.subtasks.map((subtask) => subtask.title)).toEqual(['Socks', 'Charger'])

    const [socks, charger] = current.subtasks
    current = (
      await client.patch<Task>(`/api/v1/subtasks/${socks!.id}`, {
        completed: true,
        title: 'Warm socks',
      })
    ).body
    expect(current.subtasks[0]).toMatchObject({ title: 'Warm socks' })
    expect(current.subtasks[0]!.completedAt).not.toBeNull()

    current = (
      await client.patch<Task>(`/api/v1/subtasks/${charger!.id}`, { placement: { after: null } })
    ).body
    expect(current.subtasks.map((subtask) => subtask.title)).toEqual(['Charger', 'Warm socks'])

    current = (await client.delete<Task>(`/api/v1/subtasks/${charger!.id}`)).body
    expect(current.subtasks.map((subtask) => subtask.title)).toEqual(['Warm socks'])
  })

  it('rejects empty titles', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Task' })
    expect((await client.post(`/api/v1/tasks/${task.id}/subtasks`, { title: ' ' })).status).toBe(
      400,
    )
  })
})
