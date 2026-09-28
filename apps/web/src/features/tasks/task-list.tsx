import type { List, Task } from '@crystal/shared'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type KeyboardEventHandler, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { springs } from '../../lib/motion'
import { useTaskSelection } from './hooks'
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

  const renderRow = (task: Task, extra?: Partial<Parameters<typeof TaskRow>[0]>) => (
    <TaskRow
      task={task}
      today={today}
      list={listsById?.get(task.listId)}
      selected={task.id === selectedId}
      completing={actions.completing.has(task.id)}
      onToggleComplete={actions.toggleComplete}
      onToggleImportant={actions.toggleImportant}
      onOpen={(item) => open(item.id)}
      {...extra}
    />
  )

  const withMenu = (task: Task, row: ReactNode, touchLongPress: boolean) => (
    <TaskContextMenu
      task={task}
      today={today}
      actions={actions}
      onOpen={(item) => open(item.id)}
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

/** Rows fade and fold in when added and fold away when completed or deleted. */
function AnimatedItem({ children }: { children: ReactNode }) {
  return (
    <motion.li
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={springs.smooth}
      className="overflow-visible"
    >
      {children}
    </motion.li>
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
        <motion.span animate={{ rotate: expanded ? 90 : 0 }} transition={springs.snappy}>
          <ChevronRight aria-hidden className="size-4" />
        </motion.span>
        {t('tasks.completedSection')}
        <span className="font-regular">{tasks.length}</span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
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
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
