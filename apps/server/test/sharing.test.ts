import type { List, ListMember, Person, Task, ViewCounts } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

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
  context = createTestContext({ REGISTRATION: 'open' })
  const anna = await registerUser(context, 'anna')
  const ben = await registerUser(context, 'ben')
  const carla = await registerUser(context, 'carla')
  const list = (await anna.client.post<List>('/api/v1/lists', { name: 'Household' })).body
  return { anna, ben, carla, list }
}

async function share(owner: TestClient, listId: string, userId: string, role: string) {
  const response = await owner.post<ListMember[]>(`/api/v1/lists/${listId}/members`, {
    userId,
    role,
  })
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

async function createTask(client: TestClient, input: Record<string, unknown>) {
  const response = await client.post<Task>('/api/v1/tasks', input)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

describe('sharing lists', () => {
  it('lists other people and shares with them', async () => {
    const { anna, ben, carla, list } = await setup()
    const people = await anna.client.get<Person[]>('/api/v1/people')
    expect(people.body.map((person) => person.username)).toEqual(['ben', 'carla'])
    expect(people.body[0]).not.toHaveProperty('email')

    const members = await share(anna.client, list.id, ben.me.id, 'editor')
    expect(members.map((member) => [member.username, member.role])).toEqual([
      ['anna', 'owner'],
      ['ben', 'editor'],
    ])

    // The list shows up at the end of Ben's sidebar, marked as shared.
    const bensLists = (await ben.client.get<List[]>('/api/v1/lists')).body
    expect(bensLists.map((item) => item.name)).toEqual(['Tasks', 'Household'])
    expect(bensLists[1]).toMatchObject({ role: 'editor', memberCount: 2, isDefault: false })
    expect((await carla.client.get(`/api/v1/lists/${list.id}/members`)).status).toBe(404)
  })

  it('refuses what is not allowed', async () => {
    const { anna, ben, carla, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')

    const again = await anna.client.post(`/api/v1/lists/${list.id}/members`, {
      userId: ben.me.id,
      role: 'viewer',
    })
    expect(errorCode(again)).toBe('already_member')

    // Only the owner shares, and the default list stays private.
    const byEditor = await ben.client.post(`/api/v1/lists/${list.id}/members`, {
      userId: carla.me.id,
      role: 'viewer',
    })
    expect(byEditor.status).toBe(403)
    const inbox = (await anna.client.get<List[]>('/api/v1/lists')).body.find(
      (item) => item.isDefault,
    )!
    const shareInbox = await anna.client.post(`/api/v1/lists/${inbox.id}/members`, {
      userId: ben.me.id,
      role: 'editor',
    })
    expect(errorCode(shareInbox)).toBe('list_is_default')

    // Nobody can make someone else the owner.
    const promote = await anna.client.post(`/api/v1/lists/${list.id}/members`, {
      userId: carla.me.id,
      role: 'owner',
    })
    expect(promote.status).toBe(400)
  })

  it('lets roles decide what members may do', async () => {
    const { anna, ben, carla, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')
    await share(anna.client, list.id, carla.me.id, 'viewer')
    const task = await createTask(anna.client, { listId: list.id, title: 'Trash' })

    // Editors change tasks, but not the list itself.
    expect((await createTask(ben.client, { listId: list.id, title: 'Dishes' })).title).toBe(
      'Dishes',
    )
    expect((await ben.client.patch(`/api/v1/tasks/${task.id}`, { important: true })).status).toBe(
      200,
    )
    expect((await ben.client.patch(`/api/v1/lists/${list.id}`, { name: 'Mine' })).status).toBe(403)

    // Viewers read, and may put tasks into their own My Day.
    expect((await carla.client.get<Task[]>(`/api/v1/lists/${list.id}/tasks`)).body).toHaveLength(2)
    expect((await carla.client.post('/api/v1/tasks', { listId: list.id, title: 'x' })).status).toBe(
      403,
    )
    expect((await carla.client.patch(`/api/v1/tasks/${task.id}`, { completed: true })).status).toBe(
      403,
    )
    const inMyDay = await carla.client.patch<Task>(`/api/v1/tasks/${task.id}`, { myDay: true })
    expect(inMyDay.body.inMyDay).toBe(true)
  })

  it('lets members leave and owners remove them', async () => {
    const { anna, ben, carla, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')
    await share(anna.client, list.id, carla.me.id, 'editor')

    expect(
      errorCode(await anna.client.delete(`/api/v1/lists/${list.id}/members/${anna.me.id}`)),
    ).toBe('owner_cannot_leave')
    expect(
      (await ben.client.delete(`/api/v1/lists/${list.id}/members/${carla.me.id}`)).status,
    ).toBe(403)

    expect((await ben.client.delete(`/api/v1/lists/${list.id}/members/${ben.me.id}`)).status).toBe(
      204,
    )
    expect((await ben.client.get(`/api/v1/lists/${list.id}/tasks`)).status).toBe(404)

    expect(
      (await anna.client.delete(`/api/v1/lists/${list.id}/members/${carla.me.id}`)).status,
    ).toBe(204)
    const members = await anna.client.get<ListMember[]>(`/api/v1/lists/${list.id}/members`)
    expect(members.body.map((member) => member.username)).toEqual(['anna'])
  })
})

describe('assigning tasks', () => {
  it('assigns to people who can edit and collects them in "Assigned to me"', async () => {
    const { anna, ben, carla, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')
    await share(anna.client, list.id, carla.me.id, 'viewer')
    const task = await createTask(anna.client, {
      listId: list.id,
      title: 'Trash',
      assigneeId: ben.me.id,
    })
    expect(task.assignee).toEqual({ id: ben.me.id, displayName: 'Ben' })

    const assigned = await ben.client.get<Task[]>('/api/v1/views/assigned')
    expect(assigned.body.map((item) => item.id)).toEqual([task.id])
    expect((await ben.client.get<ViewCounts>('/api/v1/views/counts')).body.assigned).toBe(1)

    for (const assigneeId of [carla.me.id, '01a0e479-47e2-7411-86ad-42eecdbb7fcd']) {
      const response = await anna.client.patch(`/api/v1/tasks/${task.id}`, { assigneeId })
      expect(errorCode(response)).toBe('not_a_member')
    }
    const nobody = await anna.client.patch<Task>(`/api/v1/tasks/${task.id}`, {
      assigneeId: null,
    })
    expect(nobody.body.assignee).toBeNull()
  })

  it('unassigns people who lose access', async () => {
    const { anna, ben, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')
    const first = await createTask(anna.client, {
      listId: list.id,
      title: 'A',
      assigneeId: ben.me.id,
    })
    const second = await createTask(anna.client, {
      listId: list.id,
      title: 'B',
      assigneeId: ben.me.id,
    })

    // Moving a task to a list Ben cannot edit.
    const inbox = (await anna.client.get<List[]>('/api/v1/lists')).body.find(
      (item) => item.isDefault,
    )!
    const moved = await anna.client.patch<Task>(`/api/v1/tasks/${first.id}`, {
      placement: { listId: inbox.id, after: null },
    })
    expect(moved.body.assignee).toBeNull()

    // Becoming a viewer.
    await anna.client.patch(`/api/v1/lists/${list.id}/members/${ben.me.id}`, { role: 'viewer' })
    expect((await anna.client.get<Task>(`/api/v1/tasks/${second.id}`)).body.assignee).toBeNull()
  })

  it('keeps the assignee for the next occurrence of a repeating task', async () => {
    const { anna, ben, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')
    const task = await createTask(anna.client, {
      listId: list.id,
      title: 'Trash',
      recurrence: { frequency: 'weekly' },
      assigneeId: ben.me.id,
    })
    await ben.client.patch(`/api/v1/tasks/${task.id}`, { completed: true })
    const next = (await ben.client.get<Task[]>('/api/v1/views/assigned')).body
    expect(next).toHaveLength(1)
    expect(next[0]!.id).not.toBe(task.id)
  })
})

describe('live updates', () => {
  it('tell members which lists changed, but not the tab that changed them', async () => {
    const { anna, ben, carla, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')

    const bens = await ben.client.openStream('/api/v1/events?client=ben-tab-0001')
    expect(bens.status).toBe(200)
    expect((await bens.next())?.event).toBe('ready')
    const annasTab = await anna.client.openStream('/api/v1/events?client=anna-tab-0001')
    expect((await annasTab.next())?.event).toBe('ready')
    const carlas = await carla.client.openStream('/api/v1/events')
    expect((await carlas.next())?.event).toBe('ready')

    await anna.client.post(
      '/api/v1/tasks',
      { listId: list.id, title: 'Trash' },
      {
        'x-crystal-client': 'anna-tab-0001',
      },
    )

    expect(await bens.next()).toEqual({
      event: 'changed',
      data: { type: 'changed', lists: [list.id] },
    })
    // Anna's own tab made the change, and Carla is not on the list.
    expect(await annasTab.next(200)).toBeNull()
    expect(await carlas.next(200)).toBeNull()

    await Promise.all([bens.close(), annasTab.close(), carlas.close()])
  })

  it('tell someone removed from a list, and require a session', async () => {
    const { anna, ben, list } = await setup()
    await share(anna.client, list.id, ben.me.id, 'editor')
    const bens = await ben.client.openStream('/api/v1/events')
    await bens.next()

    await anna.client.delete(`/api/v1/lists/${list.id}/members/${ben.me.id}`)
    expect((await bens.next())?.data).toEqual({ type: 'changed', lists: [list.id] })
    await bens.close()

    const anonymous = await context.client().openStream('/api/v1/events')
    expect(anonymous.status).toBe(401)
  })

  it('end when the session ends', async () => {
    const { ben } = await setup()
    const stream = await ben.client.openStream('/api/v1/events')
    await stream.next()
    await ben.client.post('/api/v1/auth/logout')
    // The next keep-alive notices the missing session and closes the stream.
    expect(await stream.next(1000)).toBeNull()
    expect(context.services.events.connections).toBe(0)
  })
})
