import type { List, ListGroup } from '@crystal/shared'
import { describe, expect, it } from 'vitest'

import {
  buildSidebarRows,
  listsInSidebarOrder,
  placementFor,
  type SidebarRow,
} from './sidebar-model'

const list = (id: string, position: string, groupId: string | null = null) =>
  ({ id, name: id, position, groupId }) as List
const group = (id: string, position: string, collapsed = false): ListGroup => ({
  id,
  name: id,
  position,
  collapsed,
})

const names = (rows: SidebarRow[]) =>
  rows.map((row) =>
    row.kind === 'group' ? `[${row.group.id}]` : `${'  '.repeat(row.depth)}${row.list.id}`,
  )

describe('buildSidebarRows', () => {
  const lists = [
    list('tasks', 'a0'),
    list('work', 'a3'),
    list('food', 'a1', 'family'),
    list('gifts', 'a0', 'family'),
  ]
  const groups = [group('family', 'a2')]

  it('interleaves groups and lists and nests group members', () => {
    expect(names(buildSidebarRows(lists, groups))).toEqual([
      'tasks',
      '[family]',
      '  gifts',
      '  food',
      'work',
    ])
  })

  it('hides the members of collapsed groups', () => {
    expect(names(buildSidebarRows(lists, [group('family', 'a2', true)]))).toEqual([
      'tasks',
      '[family]',
      'work',
    ])
  })

  it('lists everything in order, including collapsed groups', () => {
    expect(
      listsInSidebarOrder(lists, [group('family', 'a2', true)]).map((item) => item.id),
    ).toEqual(['tasks', 'gifts', 'food', 'work'])
  })
})

describe('placementFor', () => {
  const rows = (...ids: string[]) => {
    const all: Record<string, SidebarRow> = {
      tasks: { kind: 'list', id: 'list:tasks', list: list('tasks', 'a0'), depth: 0 },
      family: { kind: 'group', id: 'group:family', group: group('family', 'a1'), childCount: 1 },
      closed: {
        kind: 'group',
        id: 'group:closed',
        group: group('closed', 'a2', true),
        childCount: 0,
      },
      gifts: { kind: 'list', id: 'list:gifts', list: list('gifts', 'a0', 'family'), depth: 1 },
      work: { kind: 'list', id: 'list:work', list: list('work', 'a3'), depth: 0 },
    }
    return ids.map((id) => all[id]!)
  }

  it('places a list at the very top', () => {
    expect(placementFor(rows('work', 'tasks'), 'list:work')).toEqual({
      kind: 'list',
      groupId: null,
      after: null,
    })
  })

  it('moves a list into an expanded group below its header', () => {
    expect(placementFor(rows('tasks', 'family', 'work', 'gifts'), 'list:work')).toEqual({
      kind: 'list',
      groupId: 'family',
      after: null,
    })
  })

  it('places a list after a group member inside the group', () => {
    expect(placementFor(rows('tasks', 'family', 'gifts', 'work'), 'list:work')).toEqual({
      kind: 'list',
      groupId: 'family',
      after: 'gifts',
    })
  })

  it('keeps a list at the top level after a collapsed group', () => {
    expect(placementFor(rows('tasks', 'closed', 'work'), 'list:work')).toEqual({
      kind: 'list',
      groupId: null,
      after: 'closed',
    })
  })

  it('keeps groups at the top level', () => {
    expect(placementFor(rows('tasks', 'family', 'gifts', 'closed'), 'group:closed')).toEqual({
      kind: 'group',
      after: 'family',
    })
  })
})
