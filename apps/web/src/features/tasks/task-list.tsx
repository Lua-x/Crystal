import type { List, Task } from '@crystal/shared'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useState, type KeyboardEvent, type KeyboardEventHandler, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'
import { useDeleteTask } from './data'
import { useListsById, useTaskSelection } from './hooks'
import type { TaskActions } from './task-actions'
import { TaskContextMenu } from './task-menu'
import { TaskRow } from './task-row'

/** Attached to every draggable task, read by the drag-and-drop handler in the shell. */
export interface TaskDragData {
  type: 'task'
  task: Task
  /** The open tasks of the list the task is sorted in, in display order. */
  siblings: Task[]
}

interface TaskListProps {
  tasks: Task[]
  today: string
  actions: TaskActions
  label: string
  /** Show each task's list (smart lists). */
  listsById?: Map<string, List>
  /** Enables drag-and-drop sorting (only in a list's own view). */
  sortable?: boolean
}

export function TaskList({
  tasks,
  today,
  actions,
  label,
  listsById,
  sortable = false,
}: TaskListProps) {
  const { selectedId, open } = useTaskSelection()
  const deleteTask = useDeleteTask()
  const allLists = useListsById()
  // In lists shared for viewing, tasks can only be opened (and put into My Day).
  const isReadOnly = (task: Task) => allLists.get(task.listId)?.role === 'viewer'

  // Keyboard shortcuts on a focused task (see the shortcut overview).
  const onRowKeyDown = (task: Task) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return
    const completed = task.completedAt !== null || actions.completing.has(task.id)
    const editable = !isReadOnly(task)
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        moveFocus(event.currentTarget, event.key === 'ArrowDown' ? 1 : -1)
        break
      case 'x':
      case 'X':
        if (editable) actions.toggleComplete(task, !completed)
        break
      case 's':
      case 'S':
        if (editable) actions.toggleImportant(task)
        break
      case 'm':
      case 'M':
        actions.update({ id: task.id, input: { myDay: !task.inMyDay } })
        break
      case 'Delete':
      case 'Backspace':
        if (!editable) return
        // Keep the focus in the list: on the next task, or the previous one at the end.
        if (!moveFocus(event.currentTarget, 1)) moveFocus(event.currentTarget, -1)
        deleteTask.mutate(task)
        break
      default:
        return
    }
    event.preventDefault()
  }

  const renderRow = (task: Task, extra?: Partial<Parameters<typeof TaskRow>[0]>) => (
    <TaskRow
      task={task}
      today={today}
      list={listsById?.get(task.listId)}
      selected={task.id === selectedId}
      completing={actions.completing.has(task.id)}
      readOnly={isReadOnly(task)}
      onToggleComplete={actions.toggleComplete}
      onToggleImportant={actions.toggleImportant}
      onOpen={(item) => open(item.id)}
      onKeyDown={onRowKeyDown(task)}
      {...extra}
    />
  )

  const withMenu = (task: Task, row: ReactNode, touchLongPress: boolean) => (
    <TaskContextMenu
      task={task}
      today={today}
      actions={actions}
      onOpen={(item) => open(item.id)}
      readOnly={isReadOnly(task)}
      touchLongPress={touchLongPress}
    >
      <div>{row}</div>
    </TaskContextMenu>
  )

  const items = (
    <ul aria-label={label} className="flex flex-col">
      <AnimatePresence initial={false}>
        {tasks.map((task) => (
          <AnimatedItem key={task.id}>
            {sortable ? (
              // A long press picks the task up here, as in Reminders; the menu
              // stays available with a right click.
              <SortableTask task={task} siblings={tasks}>
                {(handleProps, dragging) =>
                  withMenu(task, renderRow(task, { handleProps, dragging }), false)
                }
              </SortableTask>
            ) : (
              withMenu(task, renderRow(task), true)
            )}
          </AnimatedItem>
        ))}
      </AnimatePresence>
    </ul>
  )

  if (!sortable) return items
  return (
    <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
      {items}
    </SortableContext>
  )
}

/** Moves the focus to the next or previous task on the page; false at either end. */
function moveFocus(from: HTMLElement, step: 1 | -1): boolean {
  const rows = [...document.querySelectorAll<HTMLElement>('main button[data-open]')]
  const next = rows[rows.indexOf(from) + step]
  next?.focus()
  return Boolean(next)
}

/** Rows fade and fold in when added and fold away when completed or deleted. */
function AnimatedItem({ children }: { children: ReactNode }) {
  return (
    <m.li
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={springs.smooth}
      className="overflow-visible"
    >
      {children}
    </m.li>
  )
}

function SortableTask({
  task,
  siblings,
  children,
}: {
  task: Task
  siblings: Task[]
  children: (
    handleProps: NonNullable<Parameters<typeof TaskRow>[0]['handleProps']>,
    dragging: boolean,
  ) => ReactNode
}) {
  const { t } = useTranslation()
  const data: TaskDragData = { type: 'task', task, siblings }
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id, data })

  // Mouse and touch start a drag anywhere on the row; the keyboard uses the handle.
  const { onKeyDown, ...pointerListeners } = listeners ?? {}

  return (
    <div
      ref={setNodeRef}
      {...pointerListeners}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        // No text selection or callout on the long press that starts a drag.
        'relative touch-manipulation [-webkit-touch-callout:none] pointer-coarse:select-none',
        isDragging && 'z-10 opacity-40',
      )}
    >
      {children(
        {
          ...attributes,
          ref: setActivatorNodeRef,
          onKeyDown: onKeyDown as KeyboardEventHandler<HTMLButtonElement> | undefined,
          'aria-label': t('tasks.moveHandle', { title: task.title }),
        },
        false,
      )}
    </div>
  )
}

interface CompletedSectionProps {
  tasks: Task[]
  today: string
  actions: TaskActions
  /** Remembers the open/closed state per list or view. */
  storageKey: string
  listsById?: Map<string, List>
}

/** Completed tasks, collapsible, most recent first. */
export function CompletedSection({
  tasks,
  today,
  actions,
  storageKey,
  listsById,
}: CompletedSectionProps) {
  const { t } = useTranslation()
  const key = `crystal.completed.${storageKey}`
  const [expanded, setExpanded] = useState(() => {
    try {
      return localStorage.getItem(key) !== 'collapsed'
    } catch {
      return true
    }
  })
  if (tasks.length === 0) return null

  const toggle = () => {
    setExpanded((value) => {
      try {
        localStorage.setItem(key, value ? 'collapsed' : 'expanded')
      } catch {
        // Not critical.
      }
      return !value
    })
  }

  return (
    <section className="mt-6" aria-label={t('tasks.completedSection')}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={expanded}
        className="flex h-8 cursor-default items-center gap-1.5 rounded-lg px-2 text-subhead font-semibold text-text-secondary hover:bg-fill-hover pointer-coarse:h-11"
      >
        <m.span animate={{ rotate: expanded ? 90 : 0 }} transition={springs.snappy}>
          <ChevronRight aria-hidden className="size-4" />
        </m.span>
        {t('tasks.completedSection')}
        <span className="font-regular">{tasks.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <m.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springs.smooth}
            className="overflow-hidden"
          >
            <TaskList
              tasks={tasks}
              today={today}
              actions={actions}
              label={t('tasks.completedSection')}
              {...(listsById ? { listsById } : {})}
            />
          </m.div>
        )}
      </AnimatePresence>
    </section>
  )
}
