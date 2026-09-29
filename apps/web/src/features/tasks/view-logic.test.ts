import type { List, Task } from '@crystal/shared'
import { describe, expect, it } from 'vitest'

import {
  formatDue,
  listSections,
  matchesView,
  plannedSections,
  splitByCompletion,
} from './view-logic'

const TODAY = '2026-09-30' // a Wednesday
const ME = 'me'
const words = { today: 'Today', tomorrow: 'Tomorrow', yesterday: 'Yesterday' }

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id ?? Math.random().toString(36),
    listId: 'list-a',
    title: 'Task',
    notes: '',
    dueDate: null,
    dueTime: null,
    important: false,
    priority: 0,
    position: 'a0',
    completedAt: null,
    inMyDay: false,
    recurrence: null,
    tags: [],
    assignee: null,
    subtasks: [],
    createdAt: '2026-09-30T08:00:00.000Z',
    updatedAt: '2026-09-30T08:00:00.000Z',
    ...overrides,
  }
}

describe('matchesView', () => {
  it('follows the smart list rules', () => {
    const done = task({ completedAt: '2026-09-30T09:00:00.000Z', important: true, inMyDay: true })
    expect(matchesView(done, 'my-day', TODAY, ME)).toBe(true)
    expect(matchesView(done, 'important', TODAY, ME)).toBe(false)
    expect(matchesView(done, 'completed', TODAY, ME)).toBe(true)
    expect(matchesView(task({ dueDate: '2026-09-29' }), 'overdue', TODAY, ME)).toBe(true)
    expect(matchesView(task({ dueDate: TODAY }), 'overdue', TODAY, ME)).toBe(false)
    expect(matchesView(task({ dueDate: TODAY }), 'planned', TODAY, ME)).toBe(true)
    expect(matchesView(task(), 'planned', TODAY, ME)).toBe(false)
    const mine = task({ assignee: { id: ME, displayName: 'Me' } })
    expect(matchesView(mine, 'assigned', TODAY, ME)).toBe(true)
    expect(matchesView(mine, 'assigned', TODAY, 'someone-else')).toBe(false)
  })
})

describe('grouping', () => {
  it('splits open and completed tasks, newest completion first', () => {
    const early = task({ id: 'early', completedAt: '2026-09-30T08:00:00.000Z' })
    const late = task({ id: 'late', completedAt: '2026-09-30T10:00:00.000Z' })
    const open = task({ id: 'open' })
    expect(splitByCompletion([early, open, late])).toEqual({
      open: [open],
      completed: [late, early],
    })
  })

  it('builds planned sections in order and skips empty ones', () => {
    const sections = plannedSections(
      [task({ dueDate: '2026-10-20' }), task({ dueDate: TODAY }), task({ dueDate: '2026-09-01' })],
      TODAY,
    )
    expect(sections.map((section) => section.key)).toEqual(['overdue', 'today', 'later'])
  })

  it('builds one section per list in sidebar order', () => {
    const lists = [{ id: 'list-b' }, { id: 'list-a' }] as List[]
    const sections = listSections([task({ listId: 'list-a' }), task({ listId: 'list-b' })], lists)
    expect(sections.map((section) => section.key)).toEqual(['list-b', 'list-a'])
  })
})

describe('formatDue', () => {
  it.each([
    [{ dueDate: TODAY, dueTime: null }, 'Today'],
    [{ dueDate: '2026-10-01', dueTime: null }, 'Tomorrow'],
    [{ dueDate: '2026-09-29', dueTime: null }, 'Yesterday'],
    [{ dueDate: '2026-10-03', dueTime: null }, 'Saturday'],
    [{ dueDate: '2026-10-20', dueTime: null }, 'Tue, Oct 20'],
    [{ dueDate: '2027-01-05', dueTime: null }, 'Tue, Jan 5, 2027'],
    [{ dueDate: TODAY, dueTime: '18:30' }, 'Today, 6:30 PM'],
  ])('%j → %s', (input, expected) => {
    expect(formatDue(input, TODAY, 'en-US', words)).toBe(expected)
  })

  it('uses the locale', () => {
    expect(formatDue({ dueDate: '2026-10-03', dueTime: '18:30' }, TODAY, 'de', words)).toBe(
      'Samstag, 18:30',
    )
  })
})
