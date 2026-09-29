import type { CalendarFeed, List, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { redactPath } from '../src/middleware/request-context.js'
import { createTestContext, registerUser, type TestClient, type TestContext } from './helpers.js'

let context: TestContext
afterEach(() => context.close())

async function createTask(client: TestClient, input: Record<string, unknown>) {
  const response = await client.post<Task>('/api/v1/tasks', input)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

/** Fetches the feed like a calendar app: no cookie, no Origin. */
function fetchFeed(path: string) {
  return context.client({ origin: null, ip: '198.51.100.9' }).get<string>(path)
}

describe('calendar feed', () => {
  it('lists open tasks with a due date as all-day and timed events', async () => {
    context = createTestContext()
    const anna = await registerUser(context, 'anna', { timezone: 'Europe/Berlin' })
    expect((await anna.client.get('/api/v1/me/calendar')).body).toBeNull()

    const rent = await createTask(anna.client, {
      title: 'Pay rent, finally',
      dueDate: '2026-10-01',
      tags: ['home'],
    })
    await createTask(anna.client, {
      title: 'Dentist',
      dueDate: '2026-10-02',
      dueTime: '09:15',
      notes: 'Bring the card',
    })
    await createTask(anna.client, { title: 'No date' })
    const done = await createTask(anna.client, { title: 'Done already', dueDate: '2026-10-03' })
    await anna.client.patch(`/api/v1/tasks/${done.id}`, { completed: true })

    const feed = (await anna.client.post<CalendarFeed>('/api/v1/me/calendar')).body
    expect(feed.path).toMatch(/^\/api\/calendar\/[\w-]{43}\.ics$/)
    const response = await fetchFeed(feed.path)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/calendar')
    const ics = response.body
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics).toContain(`UID:${rent.id}@crystal`)
    expect(ics).toContain('SUMMARY:Pay rent\\, finally')
    expect(ics).toContain('DTSTART;VALUE=DATE:20261001')
    expect(ics).toContain('CATEGORIES:home')
    // 09:15 in Berlin (summer time) is 07:15 UTC.
    expect(ics).toContain('DTSTART:20261002T071500Z\r\nDTEND:20261002T074500Z')
    expect(ics).toContain('DESCRIPTION:Tasks\\n\\nBring the card')
    // Long lines are folded; unfold them to compare.
    expect(ics.replace(/\r\n /g, '')).toContain(
      `URL:http://crystal.test/lists/${rent.listId}?task=${rent.id}`,
    )
    expect(ics).not.toContain('No date')
    expect(ics).not.toContain('Done already')

    const listed = (await anna.client.get<CalendarFeed>('/api/v1/me/calendar')).body
    expect(listed.path).toBe(feed.path)
    expect(listed.lastUsedAt).toBe(context.clock.now().toISOString())
  })

  it('leaves out tasks assigned to others and lists the person has no access to', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    const list = (await anna.client.post<List>('/api/v1/lists', { name: 'Home' })).body
    await anna.client.post(`/api/v1/lists/${list.id}/members`, {
      userId: ben.me.id,
      role: 'editor',
    })
    await createTask(anna.client, {
      title: 'For Ben',
      listId: list.id,
      dueDate: '2026-10-01',
      assigneeId: ben.me.id,
    })
    await createTask(anna.client, { title: 'For anyone', listId: list.id, dueDate: '2026-10-01' })
    await createTask(anna.client, { title: 'Anna only', dueDate: '2026-10-01' })

    const feed = (await ben.client.post<CalendarFeed>('/api/v1/me/calendar')).body
    const ics = (await fetchFeed(feed.path)).body
    expect(ics).toContain('SUMMARY:For Ben')
    expect(ics).toContain('SUMMARY:For anyone')
    expect(ics).not.toContain('Anna only')

    const annasFeed = (await anna.client.post<CalendarFeed>('/api/v1/me/calendar')).body
    expect((await fetchFeed(annasFeed.path)).body).not.toContain('For Ben')
  })

  it('stops working when the link is replaced or turned off', async () => {
    context = createTestContext()
    const anna = await registerUser(context, 'anna')
    const first = (await anna.client.post<CalendarFeed>('/api/v1/me/calendar')).body
    const second = (await anna.client.post<CalendarFeed>('/api/v1/me/calendar')).body
    expect(second.path).not.toBe(first.path)
    expect((await fetchFeed(first.path)).status).toBe(404)
    expect((await fetchFeed(second.path)).status).toBe(200)

    expect((await anna.client.delete('/api/v1/me/calendar')).status).toBe(204)
    expect((await fetchFeed(second.path)).status).toBe(404)
    expect((await anna.client.delete('/api/v1/me/calendar')).status).toBe(404)
    expect((await fetchFeed('/api/calendar/not-a-token.ics')).status).toBe(404)
  })

  it('keeps feed and invite secrets out of the request log', () => {
    expect(redactPath('/api/calendar/abcDEF_123.ics')).toBe('/api/calendar/[redacted]')
    expect(redactPath('/api/v1/invites/secret-token')).toBe('/api/v1/invites/[redacted]')
    expect(redactPath('/invite/secret-token')).toBe('/invite/[redacted]')
    expect(redactPath('/api/v1/tasks/123')).toBe('/api/v1/tasks/123')
  })
})
