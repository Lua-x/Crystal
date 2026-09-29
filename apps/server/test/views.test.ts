import type { List, Task, ViewCounts } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { createTestContext, registerUser, type TestClient, type TestContext } from './helpers.js'

let context: TestContext
afterEach(() => context.close())

const HOUR_MS = 60 * 60 * 1000

// The test clock starts at 2026-09-27T10:00:00Z – 12:00 in Berlin.
async function setup(timezone = 'Europe/Berlin') {
  context = createTestContext()
  const { client } = await registerUser(context, 'anna', { timezone })
  const list = (await client.post<List>('/api/v1/lists', { name: 'Household' })).body
  return { client, list }
}

async function add(client: TestClient, listId: string, input: Record<string, unknown>) {
  const response = await client.post<Task>('/api/v1/tasks', { listId, ...input })
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

async function view(client: TestClient, name: string) {
  return (await client.get<Task[]>(`/api/v1/views/${name}`)).body.map((task) => task.title)
}

describe('My Day', () => {
  it('contains the tasks picked for today and resets the next day', async () => {
    const { client, list } = await setup()
    await add(client, list.id, { title: 'Dentist', myDay: true })
    context.clock.advance(1000)
    const done = await add(client, list.id, { title: 'Email', myDay: true })
    await add(client, list.id, { title: 'Not today' })
    await client.patch(`/api/v1/tasks/${done.id}`, { completed: true })

    // Newest first; completed tasks stay (shown as completed) for the rest of the day.
    expect(await view(client, 'my-day')).toEqual(['Email', 'Dentist'])
    expect((await client.get<ViewCounts>('/api/v1/views/counts')).body['my-day']).toBe(1)

    // Midnight in Berlin is 22:00 UTC.
    context.clock.advance(12 * HOUR_MS)
    expect(await view(client, 'my-day')).toEqual([])
  })

  it('suggests overdue, soon due and recently added tasks', async () => {
    const { client, list } = await setup()
    await add(client, list.id, { title: 'Overdue', dueDate: '2026-09-20' })
    await add(client, list.id, { title: 'Tomorrow', dueDate: '2026-09-28' })
    await add(client, list.id, { title: 'Next month', dueDate: '2026-10-27' })
    await add(client, list.id, { title: 'Picked', dueDate: '2026-09-27', myDay: true })
    await add(client, list.id, { title: 'New idea' })

    const suggestions = (await client.get<Task[]>('/api/v1/views/my-day/suggestions')).body
    expect(suggestions.map((task) => task.title)).toEqual(['Overdue', 'Tomorrow', 'New idea'])
  })
})

describe('smart lists', () => {
  it('filter and sort as expected', async () => {
    const { client, list } = await setup()
    await add(client, list.id, { title: 'Late', dueDate: '2026-09-25', important: true })
    await add(client, list.id, { title: 'Today 18:00', dueDate: '2026-09-27', dueTime: '18:00' })
    await add(client, list.id, { title: 'Today 08:00', dueDate: '2026-09-27', dueTime: '08:00' })
    await add(client, list.id, { title: 'Today', dueDate: '2026-09-27' })
    await add(client, list.id, { title: 'Later', dueDate: '2026-10-15', important: true })
    await add(client, list.id, { title: 'Someday' })
    const finished = await add(client, list.id, { title: 'Finished', dueDate: '2026-09-01' })
    await client.patch(`/api/v1/tasks/${finished.id}`, { completed: true })

    expect(await view(client, 'planned')).toEqual([
      'Late',
      'Today 08:00',
      'Today 18:00',
      'Today',
      'Later',
    ])
    expect(await view(client, 'overdue')).toEqual(['Late'])
    expect(await view(client, 'important')).toEqual(['Late', 'Later'])
    expect(await view(client, 'completed')).toEqual(['Finished'])
    expect((await view(client, 'all')).sort()).toEqual(
      ['Late', 'Later', 'Someday', 'Today', 'Today 08:00', 'Today 18:00'].sort(),
    )

    const counts = (await client.get<ViewCounts>('/api/v1/views/counts')).body
    expect(counts).toEqual({
      'my-day': 0,
      important: 2,
      planned: 5,
      overdue: 1,
      assigned: 0,
      all: 6,
      completed: 1,
    })
  })

  it('decides what is overdue in the user’s time zone', async () => {
    // 10:00 UTC on 27 September is already the 28th on Kiritimati (UTC+14).
    const { client, list } = await setup('Pacific/Kiritimati')
    await add(client, list.id, { title: 'Due 27th', dueDate: '2026-09-27' })
    expect(await view(client, 'overdue')).toEqual(['Due 27th'])
  })

  it('rejects unknown smart lists', async () => {
    const { client } = await setup()
    expect((await client.get('/api/v1/views/someday')).status).toBe(400)
  })
})

describe('search', () => {
  it('finds tasks by title, notes and subtasks, ignoring accents and case', async () => {
    const { client, list } = await setup()
    await add(client, list.id, { title: 'Müll rausbringen' })
    await add(client, list.id, { title: 'Call the plumber', notes: 'Ask about the **boiler**' })
    const packing = await add(client, list.id, { title: 'Packing' })
    await client.post(`/api/v1/tasks/${packing.id}/subtasks`, { title: 'Sunscreen' })

    const search = async (q: string) =>
      (await client.get<Task[]>(`/api/v1/search?q=${encodeURIComponent(q)}`)).body.map(
        (task) => task.title,
      )

    expect(await search('mull')).toEqual(['Müll rausbringen'])
    expect(await search('MÜLL raus')).toEqual(['Müll rausbringen'])
    expect(await search('boil')).toEqual(['Call the plumber'])
    expect(await search('sunscr')).toEqual(['Packing'])
    expect(await search('plumber boiler')).toEqual(['Call the plumber'])
    expect(await search('nothing')).toEqual([])
  })

  it('treats search syntax as plain text', async () => {
    const { client, list } = await setup()
    await add(client, list.id, { title: 'Quote "this" AND that' })
    for (const q of ['"', 'AND', 'NOT that', '*', 'title:x', '(']) {
      const response = await client.get(`/api/v1/search?q=${encodeURIComponent(q)}`)
      expect(response.status, q).toBe(200)
    }
  })

  it('updates when tasks change or are deleted', async () => {
    const { client, list } = await setup()
    const task = await add(client, list.id, { title: 'Old title' })
    await client.patch(`/api/v1/tasks/${task.id}`, { title: 'New title' })
    const search = async (q: string) =>
      (await client.get<Task[]>(`/api/v1/search?q=${q}`)).body.length

    expect(await search('old')).toBe(0)
    expect(await search('new')).toBe(1)
    await client.delete(`/api/v1/tasks/${task.id}`)
    expect(await search('new')).toBe(0)
  })

  it('requires a query', async () => {
    const { client } = await setup()
    expect((await client.get('/api/v1/search?q=')).status).toBe(400)
  })
})
