import { keyBetween, type List, type ListGroup } from '@crystal/shared'

export type SidebarRow =
  | { kind: 'group'; id: string; group: ListGroup; childCount: number }
  | { kind: 'list'; id: string; list: List; depth: 0 | 1 }

export const listRowId = (id: string) => `list:${id}`
export const groupRowId = (id: string) => `group:${id}`

const byPosition = (a: { position: string }, b: { position: string }) =>
  a.position < b.position ? -1 : a.position > b.position ? 1 : 0

/**
 * The sidebar as a flat list of rows: groups and ungrouped lists share one
 * order at the top level; a group's lists follow it (unless it is collapsed).
 */
export function buildSidebarRows(
  lists: List[],
  groups: ListGroup[],
  options: { hideChildrenOf?: string } = {},
): SidebarRow[] {
  const groupIds = new Set(groups.map((group) => group.id))
  const topLevel = [
    ...groups.map((group) => ({ position: group.position, group })),
    ...lists
      .filter((list) => !list.groupId || !groupIds.has(list.groupId))
      .map((list) => ({ position: list.position, list })),
  ].sort(byPosition)

  const rows: SidebarRow[] = []
  for (const item of topLevel) {
    if ('list' in item) {
      rows.push({ kind: 'list', id: listRowId(item.list.id), list: item.list, depth: 0 })
      continue
    }
    const children = lists.filter((list) => list.groupId === item.group.id).sort(byPosition)
    rows.push({
      kind: 'group',
      id: groupRowId(item.group.id),
      group: item.group,
      childCount: children.length,
    })
    if (item.group.collapsed || options.hideChildrenOf === item.group.id) continue
    for (const list of children) rows.push({ kind: 'list', id: listRowId(list.id), list, depth: 1 })
  }
  return rows
}

/** All lists in sidebar order, including those in collapsed groups. */
export function listsInSidebarOrder(lists: List[], groups: ListGroup[]): List[] {
  const expanded = groups.map((group) => ({ ...group, collapsed: false }))
  return buildSidebarRows(lists, expanded).flatMap((row) => (row.kind === 'list' ? [row.list] : []))
}

export type SidebarPlacement =
  | { kind: 'list'; groupId: string | null; after: string | null }
  | { kind: 'group'; after: string | null }

/**
 * Where a dragged row lands, given the rows in their new order. A list goes
 * into the group whose header or member is right above it; a group always
 * stays at the top level.
 */
export function placementFor(rows: SidebarRow[], movedId: string): SidebarPlacement | null {
  const index = rows.findIndex((row) => row.id === movedId)
  const moved = rows[index]
  if (!moved) return null
  const above = rows.slice(0, index).reverse()

  if (moved.kind === 'group') {
    const previousTopLevel = above.find((row) => row.kind === 'group' || row.depth === 0)
    return { kind: 'group', after: previousTopLevel ? entityId(previousTopLevel) : null }
  }

  const neighbour = above[0]
  if (!neighbour) return { kind: 'list', groupId: null, after: null }
  if (neighbour.kind === 'group') {
    return neighbour.group.collapsed
      ? { kind: 'list', groupId: null, after: neighbour.group.id }
      : { kind: 'list', groupId: neighbour.group.id, after: null }
  }
  if (neighbour.depth === 1) {
    return { kind: 'list', groupId: neighbour.list.groupId, after: neighbour.list.id }
  }
  return { kind: 'list', groupId: null, after: neighbour.list.id }
}

/**
 * The position a moved list or group gets locally, so it does not jump back
 * while the server computes the real one. Undefined if keys collide.
 */
export function localPosition(
  lists: List[],
  groups: ListGroup[],
  movedId: string,
  placement: SidebarPlacement,
): string | undefined {
  const container =
    placement.kind === 'list' && placement.groupId
      ? lists.filter((list) => list.groupId === placement.groupId)
      : [
          ...groups,
          ...lists.filter(
            (list) => !list.groupId || !groups.some((group) => group.id === list.groupId),
          ),
        ]
  const items = container.filter((item) => item.id !== movedId).sort(byPosition)
  const index =
    placement.after === null ? -1 : items.findIndex((item) => item.id === placement.after)
  if (placement.after !== null && index === -1) return undefined
  try {
    return keyBetween(
      index >= 0 ? items[index]!.position : null,
      items[index + 1]?.position ?? null,
    )
  } catch {
    return undefined
  }
}

function entityId(row: SidebarRow): string {
  return row.kind === 'group' ? row.group.id : row.list.id
}
