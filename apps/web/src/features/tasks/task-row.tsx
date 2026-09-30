import type { List, Task } from '@crystal/shared'
import {
  Bell,
  CalendarDays,
  EyeOff,
  GripVertical,
  ListChecks,
  MapPin,
  NotebookText,
  Paperclip,
  Repeat,
  Star,
  Sun,
  Trophy,
} from 'lucide-react'
import type { HTMLAttributes, KeyboardEventHandler, ReactNode, Ref } from 'react'
import { useTranslation } from 'react-i18next'

import { Avatar } from '../../components/ui/avatar'
import { TaskCheckbox } from '../../components/ui/task-checkbox'
import { cn } from '../../lib/cn'
import { useClock } from '../../lib/use-clock'
import { GameCover } from '../games/game-cover'
import { formatRarity } from '../games/game-logic'
import { useMe } from '../shell/use-me'
import { ListIcon } from './list-style'
import { describeRecurrence } from './recurrence-text'
import { reminderParts } from './reminder'
import { dueState, formatDue } from './view-logic'

export interface TaskRowProps {
  task: Task
  today: string
  /** Shown in smart lists, where tasks come from different lists. */
  list?: List | undefined
  selected?: boolean
  /** Shown checked while the completion is animating. */
  completing?: boolean
  /** In a list the user can only view: nothing but opening the details. */
  readOnly?: boolean
  onToggleComplete: (task: Task, completed: boolean) => void
  onToggleImportant: (task: Task) => void
  onOpen: (task: Task) => void
  /** Shortcuts while the task has the focus. */
  onKeyDown?: KeyboardEventHandler<HTMLButtonElement>
  /** Keyboard drag handle props (from dnd-kit); omitted when not sortable. */
  handleProps?: HTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }
  dragging?: boolean
  className?: string
}

/**
 * One task: checkbox, title with details, and the importance star. The title
 * is a button that opens the details; checkbox and star are separate buttons,
 * so no interactive element is nested in another.
 */
export function TaskRow({
  task,
  today,
  list,
  selected = false,
  completing = false,
  readOnly = false,
  onToggleComplete,
  onToggleImportant,
  onOpen,
  onKeyDown,
  handleProps,
  dragging = false,
  className,
}: TaskRowProps) {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const now = useClock()
  const completed = completing || task.completedAt !== null
  const due = formatDue(task, today, i18n.language, {
    today: t('tasks.today'),
    tomorrow: t('tasks.tomorrow'),
    yesterday: t('tasks.yesterday'),
  })
  const state = task.completedAt ? null : dueState(task, today)
  const stepsDone = task.subtasks.filter((subtask) => subtask.completedAt).length

  const meta: ReactNode[] = []
  if (task.inMyDay && !list) {
    meta.push(
      <span key="myday" className="inline-flex items-center gap-1">
        <Sun aria-hidden className="size-3.5" />
        {t('tasks.inMyDay')}
      </span>,
    )
  }
  if (list) {
    meta.push(
      <span key="list" className="inline-flex min-w-0 items-center gap-1">
        <ListIcon list={list} className="size-3.5 text-caption" />
        <span className="truncate">{list.name}</span>
      </span>,
    )
  }
  if (due) {
    meta.push(
      <span
        key="due"
        className={cn(
          'inline-flex items-center gap-1',
          state === 'overdue' && 'font-medium text-danger',
          state === 'today' && 'font-medium text-accent-text',
        )}
      >
        <CalendarDays aria-hidden className="size-3.5" />
        {state === 'overdue' && <span className="sr-only">{t('tasks.overdue')}: </span>}
        {due}
        {task.recurrence && (
          <Repeat
            role="img"
            aria-label={describeRecurrence(task.recurrence, t, i18n.language)}
            className="size-3.5"
          />
        )}
      </span>,
    )
  }
  for (const tag of task.tags) {
    meta.push(
      <span key={`tag-${tag}`} className="max-w-40 truncate">
        #{tag}
      </span>,
    )
  }
  if (task.subtasks.length > 0) {
    meta.push(
      <span key="steps" className="inline-flex items-center gap-1">
        <ListChecks aria-hidden className="size-3.5" />
        {t('tasks.steps', { done: stepsDone, total: task.subtasks.length })}
      </span>,
    )
  }
  if (task.remindAt && !completed && Date.parse(task.remindAt) > now) {
    const reminder = formatDue(reminderParts(task.remindAt, me.timezone), today, i18n.language, {
      today: t('tasks.today'),
      tomorrow: t('tasks.tomorrow'),
      yesterday: t('tasks.yesterday'),
    })
    meta.push(
      <span key="reminder" className="inline-flex items-center">
        <Bell role="img" aria-label={t('reminder.row', { time: reminder })} className="size-3.5" />
      </span>,
    )
  }
  if (task.pin) {
    meta.push(
      <span key="pin" className="inline-flex items-center">
        <MapPin role="img" aria-label={t('maps.pinned')} className="size-3.5" />
      </span>,
    )
  }
  if (task.attachments.length > 0) {
    meta.push(
      <span
        key="attachments"
        role="img"
        aria-label={t('attachments.count', { count: task.attachments.length })}
        className="inline-flex items-center gap-0.5"
      >
        <Paperclip aria-hidden className="size-3.5" />
        {task.attachments.length}
      </span>,
    )
  }
  if (task.achievement?.percent != null) {
    const percent = formatRarity(task.achievement.percent, i18n.language)
    meta.push(
      <span
        key="rarity"
        role="img"
        aria-label={t('games.rarityLabel', { percent })}
        className="inline-flex items-center gap-1"
      >
        <Trophy aria-hidden className="size-3.5" />
        {percent}
      </span>,
    )
  }
  if (task.achievement?.hidden && !task.notes.trim() && !completed) {
    meta.push(
      <span key="hidden" className="inline-flex items-center gap-1">
        <EyeOff aria-hidden className="size-3.5" />
        {t('games.hidden')}
      </span>,
    )
  }
  if (task.notes.trim()) {
    meta.push(
      <span key="notes" className="inline-flex items-center">
        <NotebookText aria-label={t('tasks.hasNotes')} className="size-3.5" />
      </span>,
    )
  }

  return (
    <div
      className={cn(
        'group/row relative flex min-h-12 items-center gap-1 rounded-xl pr-1.5 pl-1 transition-colors duration-150',
        'hover:bg-fill-hover has-[button[data-open]:active]:bg-fill-pressed',
        selected && 'bg-accent-soft hover:bg-accent-soft',
        dragging && 'bg-elevated shadow-lg',
        className,
      )}
    >
      {handleProps && (
        <button
          type="button"
          {...handleProps}
          className="absolute top-1/2 -left-5 hidden h-8 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded-md text-text-tertiary opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 active:cursor-grabbing md:flex"
        >
          <GripVertical aria-hidden className="size-4" />
        </button>
      )}

      <TaskCheckbox
        checked={completed}
        disabled={readOnly}
        onCheckedChange={(checked) => onToggleComplete(task, checked)}
        label={
          completed
            ? t('tasks.reopen', { title: task.title })
            : t('tasks.complete', { title: task.title })
        }
        className="relative z-10"
      />

      {task.achievement?.iconImageId && (
        <GameCover
          imageId={task.achievement.iconImageId}
          className={cn(
            'ml-1 size-8 shrink-0 rounded-md transition-[filter,opacity] duration-300',
            // Like on Steam: locked achievements are shown in gray.
            !completed && 'opacity-70 grayscale',
          )}
        />
      )}

      <button
        type="button"
        data-open
        data-task-id={task.id}
        onClick={() => onOpen(task)}
        onKeyDown={onKeyDown}
        aria-current={selected ? 'true' : undefined}
        className="min-w-0 flex-1 cursor-default py-2 text-left outline-none before:absolute before:inset-0 before:rounded-xl focus-visible:before:outline-2 focus-visible:before:outline-offset-[-2px] focus-visible:before:outline-focus-ring"
      >
        <span
          className={cn(
            'block text-body break-words decoration-text-secondary transition-[color,text-decoration-color] duration-300',
            completed ? 'text-text-secondary line-through' : 'decoration-transparent',
          )}
        >
          {task.title}
        </span>
        {meta.length > 0 && (
          <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-footnote text-text-secondary">
            {meta}
          </span>
        )}
      </button>

      {task.assignee && (
        <span
          role="img"
          aria-label={t('sharing.assignedTo', { name: task.assignee.displayName })}
          title={task.assignee.displayName}
          className="relative z-10 flex shrink-0"
        >
          <Avatar
            name={task.assignee.displayName}
            seed={task.assignee.id}
            className="size-6 text-caption"
          />
        </span>
      )}

      {task.priority > 0 && !completed && (
        <span
          className="relative z-10 shrink-0 px-1 text-callout font-bold text-accent-text"
          aria-label={t('tasks.priorityLabel', {
            level: t(`tasks.priority.${task.priority}` as 'tasks.priority.1'),
          })}
          role="img"
        >
          {'!'.repeat(task.priority)}
        </span>
      )}

      <button
        type="button"
        disabled={readOnly}
        onClick={() => onToggleImportant(task)}
        aria-pressed={task.important}
        aria-label={
          task.important
            ? t('tasks.unmarkImportant', { title: task.title })
            : t('tasks.markImportant', { title: task.title })
        }
        className={cn(
          'relative z-10 flex size-8 shrink-0 cursor-default items-center justify-center rounded-lg transition-colors hover:bg-fill-hover pointer-coarse:size-11',
          task.important ? 'text-important' : 'text-text-tertiary hover:text-text-secondary',
        )}
      >
        <Star aria-hidden className={cn('size-4.5', task.important && 'fill-current')} />
      </button>
    </div>
  )
}
