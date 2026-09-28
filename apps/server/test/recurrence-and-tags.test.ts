import type { List, TagSummary, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { createTestContext, registerUser, type TestClient, type TestContext } from './helpers.js'

// The test clock starts on Sunday, 27 September 2026 (Europe/Berlin).
let context: TestContext
afterEach(() => context.close())

async function setup() {
  context = createTestContext({ REGISTRATION: 'open' })
  const { client } = await registerUser(context, 'anna', { timezone: 'Europe/Berlin' })
  const list = (await client.post<List>('/api/v1/lists', { name: 'Household' })).body
  return { client, list }
}

async function createTask(client: TestClient, input: Record<string, unknown>) {
  const response = await client.post<Task>('/api/v1/tasks', input)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

async function update(client: TestClient, id: string, input: Record<string, unknown>) {
  const response = await client.patch<Task>(`/api/v1/tasks/${id}`, input)
  expect(response.status, JSON.stringify(response.body)).toBe(200)
  return response.body
}

async function tasksOf(client: TestClient, listId: string) {
  return (await client.get<Task[]>(`/api/v1/lists/${listId}/tasks`)).body
}

describe('repeating tasks', () => {
  it('become due on their first occurrence when created without a date', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, {
      listId: list.id,
      title: 'Paper bin',
      recurrence: { frequency: 'weekly', weekdays: [1] },
    })
    expect(task.dueDate).toBe('2026-09-29')
    expect(task.recurrence).toEqual({
      frequency: 'weekly',
      interval: 1,
      weekdays: [1],
      from: 'due',
    })
  })

  it('create the next occurrence when completed', async () => {
    const { client, list } = await setup()
    const other = await createTask(client, { listId: list.id, title: 'Other' })
    const task = await createTask(client, {
      listId: list.id,
      title: 'Take out the trash',
      notes: 'Yellow bin',
      dueDate: '2026-09-27',
      dueTime: '18:00',
      important: true,
      priority: 2,
      recurrence: { frequency: 'weekly' },
      tags: ['home'],
    })
    const step = (
      await client.post<Task>(`/api/v1/tasks/${task.id}/subtasks`, { title: 'Sort glass' })
    ).body.subtasks[0]!
    await client.patch(`/api/v1/subtasks/${step.id}`, { completed: true })

    const completed = await update(client, task.id, { completed: true })
    expect(completed.completedAt).not.toBeNull()
    // The rule moves on to the next task, so each series has one open task.
    expect(completed.recurrence).toBeNull()

    const all = await tasksOf(client, list.id)
    const next = all.find((item) => item.id !== task.id && item.id !== other.id)!
    expect(next).toMatchObject({
      title: 'Take out the trash',
      notes: 'Yellow bin',
      dueDate: '2026-10-04',
      dueTime: '18:00',
      important: true,
      priority: 2,
      completedAt: null,
      recurrence: { frequency: 'weekly', interval: 1 },
      tags: ['home'],
    })
    expect(next.subtasks).toMatchObject([{ title: 'Sort glass', completedAt: null }])
    // It takes the place of the completed task.
    expect(all.map((item) => item.id)).toEqual([task.id, next.id, other.id])
  })

  it('take the next occurrence back when reopened right away', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, {
      listId: list.id,
      title: 'Water plants',
      recurrence: { frequency: 'daily', interval: 2 },
    })
    await update(client, task.id, { completed: true })
    expect(await tasksOf(client, list.id)).toHaveLength(2)

    const reopened = await update(client, task.id, { completed: false })
    expect(reopened.recurrence).toMatchObject({ frequency: 'daily', interval: 2 })
    expect((await tasksOf(client, list.id)).map((item) => item.id)).toEqual([task.id])
  })

  it('keep a next occurrence that was changed meanwhile', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, {
      listId: list.id,
      title: 'Water plants',
      recurrence: { frequency: 'daily' },
    })
    await update(client, task.id, { completed: true })
    const next = (await tasksOf(client, list.id)).find((item) => item.id !== task.id)!
    context.clock.advance(1000)
    await update(client, next.id, { title: 'Water all plants' })

    const reopened = await update(client, task.id, { completed: false })
    expect(reopened.recurrence).toBeNull()
    expect(await tasksOf(client, list.id)).toHaveLength(2)
  })

  it('keep the day of the month across short months', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, {
      listId: list.id,
      title: 'Pay rent',
      dueDate: '2027-01-31',
      recurrence: { frequency: 'monthly' },
    })
    await update(client, task.id, { completed: true })
    const february = (await tasksOf(client, list.id)).find((item) => !item.completedAt)!
    expect(february.dueDate).toBe('2027-02-28')
    await update(client, february.id, { completed: true })
    const march = (await tasksOf(client, list.id)).find((item) => !item.completedAt)!
    expect(march.dueDate).toBe('2027-03-31')
  })

  it('count from the day of completion if asked to', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, {
      listId: list.id,
      title: 'Descale the kettle',
      dueDate: '2026-09-01',
      recurrence: { frequency: 'daily', interval: 30, from: 'completion' },
    })
    await update(client, task.id, { completed: true })
    const next = (await tasksOf(client, list.id)).find((item) => !item.completedAt)!
    expect(next.dueDate).toBe('2026-10-27')
  })

  it('stop repeating when the due date is removed, and need a date to repeat', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, { listId: list.id, title: 'Plants' })
    const repeating = await update(client, task.id, { recurrence: { frequency: 'daily' } })
    expect(repeating.dueDate).toBe('2026-09-27')

    const stopped = await update(client, task.id, { dueDate: null })
    expect(stopped).toMatchObject({ dueDate: null, recurrence: null })

    const again = await update(client, task.id, { recurrence: { frequency: 'weekly' } })
    expect(again.dueDate).toBe('2026-09-27')
    expect((await update(client, task.id, { recurrence: null })).recurrence).toBeNull()
  })

  it('reject invalid rules', async () => {
    const { client, list } = await setup()
    for (const recurrence of [
      { frequency: 'hourly' },
      { frequency: 'daily', interval: 0 },
      { frequency: 'weekly', weekdays: [9] },
    ]) {
      const response = await client.post('/api/v1/tasks', {
        listId: list.id,
        title: 'A',
        recurrence,
      })
      expect(response.status, JSON.stringify(recurrence)).toBe(400)
    }
  })
})

describe('tags', () => {
  it('are normalized, replaced and searchable', async () => {
    const { client, list } = await setup()
    const task = await createTask(client, {
      listId: list.id,
      title: 'Book flights',
      tags: ['#Trip', 'trip', 'family'],
    })
    expect(task.tags).toEqual(['family', 'trip'])

    const found = await client.get<Task[]>('/api/v1/search?q=trip')
    expect(found.body.map((item) => item.id)).toEqual([task.id])

    const updated = await update(client, task.id, { tags: ['summer'] })
    expect(updated.tags).toEqual(['summer'])
    expect((await client.get<Task[]>('/api/v1/search?q=trip')).body).toEqual([])

    const invalid = await client.patch(`/api/v1/tasks/${task.id}`, { tags: ['two words'] })
    expect(invalid.status).toBe(400)
  })

  it('are listed with their open tasks', async () => {
    const { client, list } = await setup()
    const a = await createTask(client, { listId: list.id, title: 'A', tags: ['home'] })
    const b = await createTask(client, {
      listId: list.id,
      title: 'B',
      tags: ['home', 'errand'],
      dueDate: '2026-09-30',
    })
    const done = await createTask(client, { listId: list.id, title: 'C', tags: ['home'] })
    await update(client, done.id, { completed: true })
    const deleted = await createTask(client, { listId: list.id, title: 'D', tags: ['gone'] })
    await client.delete(`/api/v1/tasks/${deleted.id}`)

    expect((await client.get<TagSummary[]>('/api/v1/tags')).body).toEqual([
      { name: 'errand', openCount: 1 },
      { name: 'home', openCount: 2 },
    ])
    // Open tasks by due date (undated last), then completed ones.
    const tagged = await client.get<Task[]>('/api/v1/tags/HOME/tasks')
    expect(tagged.body.map((item) => item.id)).toEqual([b.id, a.id, done.id])
  })

  it('are private to the lists one can see', async () => {
    const { client, list } = await setup()
    await createTask(client, { listId: list.id, title: 'Secret', tags: ['surprise'] })
    const { client: ben } = await registerUser(context, 'ben')
    expect((await ben.get<TagSummary[]>('/api/v1/tags')).body).toEqual([])
    expect((await ben.get<Task[]>('/api/v1/tags/surprise/tasks')).body).toEqual([])
  })
})
