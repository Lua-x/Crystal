import type { List, ListGroup } from '@crystal/shared'
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DroppableContainer,
  type KeyboardCoordinateGetter,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable'
import { useQueryClient } from '@tanstack/react-query'
import { GripVertical } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '../../components/ui/toast-store'
import { localPositionAfter, taskKeys, useUpdateGroup, useUpdateList, useUpdateTask } from './data'
import { ListIcon } from './list-style'
import type { SidebarDragData } from './sidebar-lists'
import { localPosition, placementFor } from './sidebar-model'
import type { TaskDragData } from './task-list'

type DragData = TaskDragData | SidebarDragData

function dragData(value: unknown): DragData | undefined {
  return value as DragData | undefined
}

function nameOf(data: DragData | undefined): string {
  if (!data) return ''
  if (data.type === 'task') return data.task.title
  return data.row.kind === 'group' ? data.row.group.name : data.row.list.name
}

/**
 * Tasks sort among tasks; lists and groups among the sidebar rows. (Dropping a
 * task onto a list is a pointer gesture; the keyboard uses "Move to" instead.)
 */
function sortsWith(active: DragData | undefined, container: DroppableContainer): boolean {
  const kind = dragData(container.data.current)?.type
  return active?.type === 'task' ? kind === 'task' : kind === 'list' || kind === 'group'
}

/** The subset of droppables that dnd-kit's keyboard navigation should consider. */
class DroppableSubset extends Map<UniqueIdentifier, DroppableContainer> {
  override get(id: UniqueIdentifier | null | undefined): DroppableContainer | undefined {
    return id == null ? undefined : super.get(id)
  }
  toArray(): DroppableContainer[] {
    return [...this.values()]
  }
  getEnabled(): DroppableContainer[] {
    return this.toArray().filter((container) => !container.disabled)
  }
  getNodeFor(id: UniqueIdentifier | null | undefined): HTMLElement | undefined {
    return this.get(id)?.node.current ?? undefined
  }
}

/** Arrow keys move to the next row of the same kind, never across areas. */
const keyboardCoordinates: KeyboardCoordinateGetter = (event, args) => {
  const active = dragData(args.context.active?.data.current)
  const droppableContainers = new DroppableSubset()
  for (const container of args.context.droppableContainers.values()) {
    if (sortsWith(active, container)) droppableContainers.set(container.id, container)
  }
  return sortableKeyboardCoordinates(event, {
    ...args,
    context: { ...args.context, droppableContainers },
  })
}

/**
 * One drag-and-drop context for the whole app: tasks are sorted within their
 * list or dropped onto a list in the sidebar; lists and groups are sorted in
 * the sidebar. Works with mouse, touch (long press) and keyboard.
 */
export function DndProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const updateTask = useUpdateTask()
  const updateList = useUpdateList()
  const updateGroup = useUpdateGroup()
  const [active, setActive] = useState<DragData | null>(null)

  // Mouse and touch are handled separately: a pointer sensor would also react
  // to touches, so swiping to scroll could start a drag. Touch waits for a
  // short, steady press instead.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: keyboardCoordinates }),
  )

  const collisionDetection: CollisionDetection = (args) => {
    const active = dragData(args.active.data.current)
    if (active?.type === 'task') {
      // A list in the sidebar under the pointer wins; otherwise sort among tasks.
      const lists = pointerWithin(args).filter(
        (collision) =>
          dragData(args.droppableContainers.find((c) => c.id === collision.id)?.data.current)
            ?.type === 'list',
      )
      if (lists.length > 0) return lists
    }
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) =>
        sortsWith(active, container),
      ),
    })
  }

  const onDragStart = (event: DragStartEvent) =>
    setActive(dragData(event.active.data.current) ?? null)

  const onDragEnd = ({ active: dragged, over }: DragEndEvent) => {
    setActive(null)
    const source = dragData(dragged.data.current)
    const target = dragData(over?.data.current)
    if (!source || !target || !over) return

    if (source.type === 'task') {
      if (target.type === 'list' && target.row.kind === 'list') {
        const list = target.row.list
        if (list.id === source.task.listId || list.role === 'viewer') return
        updateTask.mutate({
          id: source.task.id,
          input: { placement: { listId: list.id, after: null } },
        })
        toast({ title: t('lists.movedTo', { list: list.name }) })
        return
      }
      if (target.type !== 'task' || dragged.id === over.id) return
      const ids = source.siblings.map((task) => task.id)
      const from = ids.indexOf(String(dragged.id))
      const to = ids.indexOf(String(over.id))
      if (from === -1 || to === -1) return
      const order = arrayMove(ids, from, to)
      const after = order[to - 1] ?? null
      updateTask.mutate({
        id: source.task.id,
        input: { placement: { after } },
        position: localPositionAfter(source.siblings, source.task.id, after),
      })
      return
    }

    if (target.type === 'task' || dragged.id === over.id) return
    const ids = source.rows.map((row) => row.id)
    const from = ids.indexOf(String(dragged.id))
    const to = ids.indexOf(String(over.id))
    if (from === -1 || to === -1) return
    const reordered = arrayMove(source.rows, from, to)
    const placement = placementFor(reordered, String(dragged.id))
    if (!placement) return
    const lists = queryClient.getQueryData<List[]>(taskKeys.lists) ?? []
    const groups = queryClient.getQueryData<ListGroup[]>(taskKeys.groups) ?? []

    if (placement.kind === 'list' && source.row.kind === 'list') {
      const id = source.row.list.id
      updateList.mutate({
        id,
        input: { placement: { groupId: placement.groupId, after: placement.after } },
        position: localPosition(lists, groups, id, placement),
      })
    } else if (placement.kind === 'group' && source.row.kind === 'group') {
      const id = source.row.group.id
      updateGroup.mutate({
        id,
        input: { placement: { after: placement.after } },
        position: localPosition(lists, groups, id, placement),
      })
    }
  }

  const announcements: Announcements = useMemo(
    () => ({
      onDragStart: ({ active: item }) =>
        t('dnd.pickedUp', { name: nameOf(dragData(item.data.current)) }),
      // Being "over" its own place is not news; it would drown out "Picked up".
      onDragOver: ({ active: item, over }) =>
        over?.id === item.id
          ? undefined
          : over
            ? t('dnd.movedOver', {
                name: nameOf(dragData(item.data.current)),
                over: nameOf(dragData(over.data.current)),
              })
            : t('dnd.notOver', { name: nameOf(dragData(item.data.current)) }),
      onDragEnd: ({ active: item, over }) =>
        over && over.id !== item.id
          ? t('dnd.droppedOn', {
              name: nameOf(dragData(item.data.current)),
              over: nameOf(dragData(over.data.current)),
            })
          : t('dnd.dropped', { name: nameOf(dragData(item.data.current)) }),
      onDragCancel: ({ active: item }) =>
        t('dnd.cancelled', { name: nameOf(dragData(item.data.current)) }),
    }),
    [t],
  )

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisionDetection}
      modifiers={active && active.type !== 'task' ? [restrictToVerticalAxis] : []}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(null)}
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: t('dnd.instructions') },
      }}
    >
      {children}
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }}>
        {active && <DragPreview data={active} />}
      </DragOverlay>
    </DndContext>
  )
}

/** What follows the pointer while dragging. */
function DragPreview({ data }: { data: DragData }) {
  if (data.type === 'task') {
    return (
      <div className="flex max-w-80 items-center gap-2 rounded-xl bg-elevated px-3 py-2.5 text-body shadow-lg">
        <GripVertical aria-hidden className="size-4 shrink-0 text-text-tertiary" />
        <span className="truncate">{data.task.title}</span>
      </div>
    )
  }
  const { row } = data
  return (
    <div className="flex h-8 items-center gap-2 rounded-lg bg-elevated px-2 text-callout shadow-lg">
      {row.kind === 'list' ? (
        <>
          <ListIcon list={row.list} />
          <span className="truncate">{row.list.name}</span>
        </>
      ) : (
        <span className="truncate font-semibold text-text-secondary">{row.group.name}</span>
      )}
    </div>
  )
}
