import type { List, ListGroup, SmartView, ViewCounts } from '@crystal/shared'
import { useDndContext } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import {
  CalendarClock,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  Ellipsis,
  GripVertical,
  Inbox,
  Pencil,
  Star,
  Sun,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react'
import { m } from 'motion/react'
import { useState, type KeyboardEventHandler, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'
import { countsQuery, groupsQuery, listsQuery, useDeleteGroup, useUpdateGroup } from './data'
import { GroupDialog } from './list-dialogs'
import { ListIcon } from './list-style'
import { buildSidebarRows, type SidebarRow } from './sidebar-model'

type SmartPath = `/${SmartView}`

const TILES: { view: SmartView; to: SmartPath; icon: ReactNode; tone: string }[] = [
  { view: 'my-day', to: '/my-day', icon: <Sun />, tone: 'text-list-yellow' },
  { view: 'important', to: '/important', icon: <Star />, tone: 'text-important' },
  { view: 'planned', to: '/planned', icon: <CalendarDays />, tone: 'text-list-blue' },
  { view: 'overdue', to: '/overdue', icon: <CalendarClock />, tone: 'text-list-red' },
  { view: 'assigned', to: '/assigned', icon: <UserCheck />, tone: 'text-list-teal' },
  { view: 'all', to: '/all', icon: <Inbox />, tone: 'text-list-gray' },
  { view: 'completed', to: '/completed', icon: <CircleCheck />, tone: 'text-list-green' },
]

/** The smart lists as tiles with counts, like Apple Reminders. */
export function SmartTiles({ onNavigate }: { onNavigate: (() => void) | undefined }) {
  const { t } = useTranslation()
  const { data: counts } = useQuery(countsQuery)
  const { data: lists = [] } = useQuery(listsQuery)
  // "Assigned to me" only matters once someone shares lists with you.
  const sharing = lists.some((list) => list.memberCount > 1) || (counts?.assigned ?? 0) > 0
  const tiles = TILES.filter((tile) => tile.view !== 'assigned' || sharing)
  return (
    <ul aria-label={t('views.smartLists')} className="grid grid-cols-2 gap-2">
      {tiles.map((tile) => (
        <li key={tile.view}>
          <Tile tile={tile} count={counts?.[tile.view]} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  )
}

function Tile({
  tile,
  count,
  onNavigate,
}: {
  tile: (typeof TILES)[number]
  count: ViewCounts[SmartView] | undefined
  onNavigate: (() => void) | undefined
}) {
  const { t } = useTranslation()
  const showCount = tile.view !== 'completed' && count !== undefined
  const name = t(`views.${tile.view}`)
  return (
    <Link
      to={tile.to}
      onClick={onNavigate}
      aria-label={showCount ? `${name}, ${t('views.count', { count })}` : undefined}
      className={cn(
        'group/tile flex h-18 cursor-default flex-col justify-between rounded-xl bg-cell px-2.5 py-2 shadow-xs transition-colors',
        'hover:bg-fill-hover data-[status=active]:bg-accent data-[status=active]:text-on-accent',
        'pointer-coarse:h-20',
      )}
    >
      <span className="flex items-start justify-between">
        <span
          aria-hidden
          className={cn(
            'flex group-data-[status=active]/tile:text-on-accent [&_svg]:size-5',
            tile.tone,
          )}
        >
          {tile.icon}
        </span>
        {showCount && (
          <span className="text-title3 leading-none font-bold" aria-hidden>
            {count}
          </span>
        )}
      </span>
      <span className="truncate text-subhead font-semibold">{name}</span>
    </Link>
  )
}

/** Drag data for sidebar rows, read by the drag-and-drop handler in the shell. */
export interface SidebarDragData {
  type: 'list' | 'group'
  row: SidebarRow
  /** All rows at the start of the drag, in order. */
  rows: SidebarRow[]
}

/** Lists and groups, sortable by drag and drop; lists also accept dropped tasks. */
export function SidebarLists({ onNavigate }: { onNavigate: (() => void) | undefined }) {
  const { t } = useTranslation()
  const { data: lists = [] } = useQuery(listsQuery)
  const { data: groups = [] } = useQuery(groupsQuery)
  const { active } = useDndContext()
  const draggedGroup =
    (active?.data.current as SidebarDragData | undefined)?.type === 'group'
      ? (active?.data.current as SidebarDragData).row
      : undefined
  const rows = buildSidebarRows(lists, groups, {
    // While a group is dragged, its lists travel with it (hidden meanwhile).
    ...(draggedGroup?.kind === 'group' ? { hideChildrenOf: draggedGroup.group.id } : {}),
  })

  return (
    <SortableContext items={rows.map((row) => row.id)} strategy={verticalListSortingStrategy}>
      <ul aria-label={t('lists.myLists')} className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <SortableRow key={row.id} row={row} rows={rows}>
            {row.kind === 'group' ? (
              <GroupRow group={row.group} />
            ) : (
              <ListRow list={row.list} depth={row.depth} onNavigate={onNavigate} />
            )}
          </SortableRow>
        ))}
      </ul>
    </SortableContext>
  )
}

function SortableRow({
  row,
  rows,
  children,
}: {
  row: SidebarRow
  rows: SidebarRow[]
  children: ReactNode
}) {
  const { t } = useTranslation()
  const data: SidebarDragData = { type: row.kind, row, rows }
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    active,
  } = useSortable({ id: row.id, data })
  // A task dragged onto a list: highlight it as the drop target.
  const taskOver =
    isOver &&
    row.kind === 'list' &&
    (active?.data.current as { type?: string } | undefined)?.type === 'task'
  // Mouse and touch drag the whole row; the keyboard uses the handle below, so
  // the row itself never becomes an interactive element around the link.
  const { onKeyDown, ...pointerListeners } = listeners ?? {}
  const name = row.kind === 'group' ? row.group.name : row.list.name

  return (
    <li
      ref={setNodeRef}
      {...pointerListeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        // No link preview or text selection on the long press that starts a drag.
        'group/srow relative touch-manipulation rounded-lg [-webkit-touch-callout:none] pointer-coarse:select-none',
        isDragging && 'z-10 opacity-40',
        taskOver && 'bg-accent-soft ring-2 ring-accent',
      )}
    >
      {children}
      <button
        type="button"
        ref={setActivatorNodeRef}
        {...attributes}
        onKeyDown={onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined}
        aria-label={t('tasks.moveHandle', { title: name })}
        className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-grab items-center justify-center rounded-md bg-elevated text-text-secondary opacity-0 shadow-sm focus-visible:opacity-100"
      >
        <GripVertical aria-hidden className="size-3.5" />
      </button>
    </li>
  )
}

function ListRow({
  list,
  depth,
  onNavigate,
}: {
  list: List
  depth: 0 | 1
  onNavigate: (() => void) | undefined
}) {
  const { t } = useTranslation()
  return (
    <Link
      to="/lists/$listId"
      params={{ listId: list.id }}
      onClick={onNavigate}
      className={cn(
        'flex h-8 cursor-default items-center gap-2 rounded-lg pr-2.5 text-callout transition-colors hover:bg-fill-hover pointer-coarse:h-11',
        'data-[status=active]:bg-fill-selected data-[status=active]:font-medium',
        depth === 1 ? 'pl-7' : 'pl-1.5',
      )}
    >
      <ListIcon list={list} />
      <span className="min-w-0 flex-1 truncate">{list.name}</span>
      {list.memberCount > 1 && (
        <Users
          role="img"
          aria-label={t('sharing.sharedList')}
          className="size-3.5 shrink-0 text-text-secondary"
        />
      )}
      {list.openCount > 0 && (
        <span className="text-footnote text-text-secondary tabular-nums">{list.openCount}</span>
      )}
    </Link>
  )
}

function GroupRow({ group }: { group: ListGroup }) {
  const { t } = useTranslation()
  const update = useUpdateGroup()
  const remove = useDeleteGroup()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)

  return (
    <div className="group/grow flex h-8 items-center rounded-lg pointer-coarse:h-11">
      <button
        type="button"
        onClick={() => update.mutate({ id: group.id, input: { collapsed: !group.collapsed } })}
        aria-expanded={!group.collapsed}
        aria-label={
          group.collapsed
            ? t('lists.expand', { name: group.name })
            : t('lists.collapse', { name: group.name })
        }
        className="flex h-full min-w-0 flex-1 cursor-default items-center gap-1.5 rounded-lg pl-1.5 text-callout font-semibold text-text-secondary hover:bg-fill-hover"
      >
        <m.span animate={{ rotate: group.collapsed ? 0 : 90 }} transition={springs.snappy}>
          <ChevronRight aria-hidden className="size-4" />
        </m.span>
        <span className="truncate">{group.name}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('lists.groupActions', { name: group.name })}
          className="flex size-7 shrink-0 cursor-default items-center justify-center rounded-md text-text-secondary opacity-0 group-hover/grow:opacity-100 hover:bg-fill-hover focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:size-10 pointer-coarse:opacity-100"
        >
          <Ellipsis aria-hidden className="size-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={<Pencil />} onSelect={() => setDialog('rename')}>
            {t('lists.renameGroup')}
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => setDialog('delete')}>
            {t('lists.deleteGroup')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <GroupDialog
        open={dialog === 'rename'}
        onOpenChange={(open) => setDialog(open ? 'rename' : null)}
        group={group}
      />
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        title={t('lists.deleteGroupTitle', { name: group.name })}
        description={t('lists.deleteGroupBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() => remove.mutateAsync(group.id)}
      />
    </div>
  )
}
