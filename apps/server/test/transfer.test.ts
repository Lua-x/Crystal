import type { CrystalExport, ImportResult, List, ListGroup, Subtask, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import { parseDate, parseTime } from '../src/import/outlook.js'
import {
  createTestContext,
  errorCode,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
afterEach(() => context.close())

async function tasksOf(client: TestClient, listName: string) {
  const lists = (await client.get<List[]>('/api/v1/lists')).body
  const list = lists.find((item) => item.name === listName)
  expect(list, `list ${listName}`).toBeDefined()
  return (await client.get<Task[]>(`/api/v1/lists/${list!.id}/tasks`)).body
}

async function importFile(client: TestClient, body: Record<string, unknown>) {
  const response = await client.post<ImportResult>('/api/v1/import', body)
  expect(response.status, JSON.stringify(response.body)).toBe(201)
  return response.body
}

describe('export and import', () => {
  it('round-trips lists, groups and tasks between accounts', async () => {
    context = createTestContext({ REGISTRATION: 'open' })
    const anna = await registerUser(context, 'anna')
    const group = (await anna.client.post<ListGroup>('/api/v1/list-groups', { name: 'Home' })).body
    const list = (
      await anna.client.post<List>('/api/v1/lists', {
        name: 'Groceries',
        color: 'green',
        icon: '🛒',
        groupId: group.id,
      })
    ).body
    const milk = (
      await anna.client.post<Task>('/api/v1/tasks', {
        listId: list.id,
        title: 'Milk',
        notes: 'Oat, please',
        dueDate: '2026-10-01',
        dueTime: '18:00',
        important: true,
        priority: 2,
        tags: ['shop'],
        recurrence: { frequency: 'weekly' },
      })
    ).body
    await anna.client.post<Subtask>(`/api/v1/tasks/${milk.id}/subtasks`, { title: 'Check fridge' })
    const bread = (
      await anna.client.post<Task>('/api/v1/tasks', { listId: list.id, title: 'Bread' })
    ).body
    await anna.client.patch(`/api/v1/tasks/${bread.id}`, { completed: true })

    const exported = await anna.client.get<CrystalExport>('/api/v1/export')
    expect(exported.status).toBe(200)
    expect(exported.headers.get('content-disposition')).toMatch(
      /^attachment; filename="crystal-export-\d{4}-\d{2}-\d{2}\.json"$/,
    )
    const groceries = exported.body.lists.find((item) => item.name === 'Groceries')!
    expect(groceries).toMatchObject({ color: 'green', icon: '🛒', group: 'Home', role: 'owner' })
    expect(groceries.tasks.map((task) => task.title).sort()).toEqual(['Bread', 'Milk'])

    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    const result = await importFile(ben.client, {
      format: 'crystal',
      content: JSON.stringify(exported.body),
    })
    expect(result).toEqual({ lists: exported.body.lists.length, tasks: 2 })

    const bensLists = (await ben.client.get<List[]>('/api/v1/lists')).body
    const imported = bensLists.find((item) => item.name === 'Groceries')!
    expect(imported).toMatchObject({ color: 'green', icon: '🛒', role: 'owner' })
    expect(imported.id).not.toBe(list.id)
    const groups = (await ben.client.get<ListGroup[]>('/api/v1/list-groups')).body
    expect(groups.map((item) => item.name)).toEqual(['Home'])
    expect(imported.groupId).toBe(groups[0]!.id)

    const tasks = await tasksOf(ben.client, 'Groceries')
    const importedMilk = tasks.find((task) => task.title === 'Milk')!
    expect(importedMilk).toMatchObject({
      notes: 'Oat, please',
      dueDate: '2026-10-01',
      dueTime: '18:00',
      important: true,
      priority: 2,
      tags: ['shop'],
      recurrence: { frequency: 'weekly', interval: 1, weekdays: [], from: 'due' },
      completedAt: null,
    })
    expect(importedMilk.subtasks.map((step) => step.title)).toEqual(['Check fridge'])
    expect(tasks.find((task) => task.title === 'Bread')!.completedAt).not.toBeNull()

    // Imported tasks are found by search, too.
    const found = await ben.client.get<Task[]>('/api/v1/search?q=oat')
    expect(found.body.map((task) => task.title)).toEqual(['Milk'])
  })

  it('imports a Todoist project with labels, steps, comments and repeating dates', async () => {
    context = createTestContext()
    const anna = await registerUser(context, 'anna')
    const csv = [
      'TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE',
      'section,Kitchen,,,,,,,,',
      'task,Clean the oven @home @weekend,Use the spray,1,1,Anna (1),,every saturday,en,Europe/Berlin',
      'task,Buy sponges,,4,2,Anna (1),,,en,Europe/Berlin',
      'note,Remember gloves,,,,Anna (1),,,,',
      'task,Call landlord,,2,1,Anna (1),,2026-10-05 10:30,en,Europe/Berlin',
      'task,Paint wall,,4,1,Anna (1),,sometime soon,en,Europe/Berlin',
      'task,Morgen einkaufen,,3,1,Anna (1),,morgen,de,Europe/Berlin',
    ].join('\n')
    const result = await importFile(anna.client, {
      format: 'todoist',
      content: csv,
      listName: 'Household',
    })
    expect(result).toEqual({ lists: 1, tasks: 4 })

    const tasks = await tasksOf(anna.client, 'Household')
    const byTitle = new Map(tasks.map((task) => [task.title, task]))
    expect(byTitle.get('Clean the oven')).toMatchObject({
      notes: 'Use the spray\n\nRemember gloves',
      priority: 3,
      tags: ['home', 'weekend'],
      recurrence: { frequency: 'weekly', weekdays: [5] },
      // The test clock's today is Sunday, 27 September 2026.
      dueDate: '2026-10-03',
    })
    expect(byTitle.get('Clean the oven')!.subtasks.map((step) => step.title)).toEqual([
      'Buy sponges',
    ])
    expect(byTitle.get('Call landlord')).toMatchObject({
      dueDate: '2026-10-05',
      dueTime: '10:30',
      priority: 2,
    })
    expect(byTitle.get('Paint wall')).toMatchObject({
      dueDate: null,
      notes: 'Todoist: sometime soon',
      priority: 0,
    })
    expect(byTitle.get('Morgen einkaufen')).toMatchObject({ dueDate: '2026-09-28', priority: 1 })
  })

  it('imports tasks exported from Outlook in English and German', async () => {
    context = createTestContext()
    const anna = await registerUser(context, 'anna', { timezone: 'Europe/Berlin' })
    const english = [
      '"Subject","Start Date","Due Date","Reminder On/Off","Reminder Date","Reminder Time","Date Completed","% Complete","Categories","Notes","Priority","Status"',
      '"Renew passport","","10/15/2026","True","10/14/2026","9:30:00 AM","","0%","Admin;Travel plans","Bring photos","High","Not Started"',
      '"Old task","","9/1/2026","False","","","9/2/2026","100%","","","Normal","Completed"',
    ].join('\r\n')
    expect(
      await importFile(anna.client, { format: 'outlook', content: english, listName: 'To Do' }),
    ).toEqual({ lists: 1, tasks: 2 })
    const tasks = await tasksOf(anna.client, 'To Do')
    expect(tasks.find((task) => task.title === 'Renew passport')).toMatchObject({
      dueDate: '2026-10-15',
      important: true,
      notes: 'Bring photos',
      tags: ['admin', 'travel-plans'],
      remindAt: '2026-10-14T07:30:00.000Z',
      completedAt: null,
    })
    expect(tasks.find((task) => task.title === 'Old task')!.completedAt).toBe(
      '2026-09-02T10:00:00.000Z',
    )

    const german = [
      'Betreff;Fällig am;Erinnerung Ein/Aus;Erinnerungsdatum;Erinnerungszeit;Erledigt am;Kategorien;Notizen;Priorität;Status',
      'Steuererklärung;31.10.2026;Aus;;;;Finanzen;;Niedrig;Nicht begonnen',
    ].join('\n')
    await importFile(anna.client, { format: 'outlook', content: german, listName: 'Aufgaben' })
    expect((await tasksOf(anna.client, 'Aufgaben'))[0]).toMatchObject({
      title: 'Steuererklärung',
      dueDate: '2026-10-31',
      priority: 1,
      tags: ['finanzen'],
      remindAt: null,
    })

    expect(parseDate('31.02.2026')).toBeNull()
    expect(parseDate('None')).toBeNull()
    expect(parseTime('12:15:00 AM')).toBe('00:15')
    expect(parseTime('9:05 pm')).toBe('21:05')
  })

  it('explains files it cannot import and limits request sizes', async () => {
    context = createTestContext()
    const anna = await registerUser(context, 'anna')
    for (const body of [
      { format: 'crystal', content: 'not json' },
      { format: 'crystal', content: '{"format":"other"}' },
      { format: 'todoist', content: 'a,b\n1,2' },
      { format: 'outlook', content: 'x;y\n1;2' },
    ]) {
      const response = await anna.client.post('/api/v1/import', body)
      expect(response.status).toBe(400)
      expect(errorCode(response)).toBe('import_invalid')
    }

    const huge = await anna.client.post('/api/v1/tasks', { title: 'x'.repeat(2 * 1024 * 1024) })
    expect(response413(huge)).toBe(true)
    // Imports may be larger than other requests.
    const largeImport = await anna.client.post('/api/v1/import', {
      format: 'todoist',
      content: `TYPE,CONTENT\n${'task,Something to do\n'.repeat(100_000)}`,
      listName: 'Big',
    })
    expect(largeImport.status).toBe(400)
    expect(errorCode(largeImport)).toBe('import_invalid')
  })
})

function response413(response: { status: number; body: unknown }): boolean {
  return (
    response.status === 413 &&
    (response.body as { error?: { code?: string } }).error?.code === 'payload_too_large'
  )
}
