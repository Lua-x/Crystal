import { addDays, isoWeekday, type Priority, type Task } from '@crystal/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  Clock,
  FolderInput,
  NotebookText,
  Plus,
  Star,
  Sun,
  Trash2,
  X,
} from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { IconButton } from '../../components/ui/icon-button'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Select } from '../../components/ui/select'
import { Spinner } from '../../components/ui/spinner'
import { TaskCheckbox } from '../../components/ui/task-checkbox'
import { AutoTextarea } from '../../components/ui/textarea'
import { inputClassName } from '../../components/ui/styles'
import { cn } from '../../lib/cn'
import { formatDate } from '../../lib/format'
import { AchievementInfo } from '../games/achievement-info'
import {
  findCachedTask,
  listsQuery,
  newTaskId,
  taskQuery,
  useAddSubtask,
  useDeleteSubtask,
  useDeleteTask,
  useUpdateSubtask,
} from './data'
import { useToday } from './hooks'
import { ListIcon } from './list-style'
import { useTaskActions } from './task-actions'
import { TaskAttachments } from './task-attachments'
import {
  AssigneeEditor,
  DetailRow,
  RecurrenceEditor,
  ReminderEditor,
  TagsEditor,
} from './task-detail-fields'

const NOTES_SAVE_DELAY = 700
const Markdown = lazy(() => import('./markdown'))

export function TaskDetail({ taskId, onClose }: { taskId: string; onClose: () => void }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const query = useQuery({
    ...taskQuery(taskId),
    initialData: () => findCachedTask(queryClient, taskId),
    initialDataUpdatedAt: 0,
  })

  if (query.isError || (query.isFetched && !query.data)) {
    return (
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <p className="text-callout text-text-secondary">{t('detail.notFound')}</p>
        <Button onClick={onClose}>{t('detail.close')}</Button>
      </div>
    )
  }
  if (!query.data) {
    return (
      <div className="flex justify-center p-10">
        <Spinner className="size-5" label={t('common.loading')} />
      </div>
    )
  }
  // Remount per task, so local edit state never leaks between tasks.
  return <TaskDetailContent key={query.data.id} task={query.data} onClose={onClose} />
}

function TaskDetailContent({ task, onClose }: { task: Task; onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const today = useToday()
  const actions = useTaskActions()
  const deleteTask = useDeleteTask()
  const { data: lists = [] } = useQuery(listsQuery)
  const list = lists.find((item) => item.id === task.listId)
  const canEdit = list?.role !== 'viewer'
  const completed = task.completedAt !== null || actions.completing.has(task.id)

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-13 shrink-0 items-center justify-between gap-2 px-3">
        <span className="flex min-w-0 items-center gap-1.5 text-footnote text-text-secondary">
          {list && <ListIcon list={list} className="size-4" />}
          <span className="truncate">{list?.name}</span>
        </span>
        <IconButton label={t('detail.close')} onClick={onClose}>
          <X />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6">
        <div className="flex items-start gap-1">
          <TaskCheckbox
            checked={completed}
            disabled={!canEdit}
            onCheckedChange={(checked) => actions.toggleComplete(task, checked)}
            label={
              completed
                ? t('tasks.reopen', { title: task.title })
                : t('tasks.complete', { title: task.title })
            }
            className="mt-0.5"
          />
          <TitleEditor
            task={task}
            disabled={!canEdit}
            completed={completed}
            onSave={(title) => actions.update({ id: task.id, input: { title } })}
          />
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => actions.toggleImportant(task)}
            aria-pressed={task.important}
            aria-label={
              task.important
                ? t('tasks.unmarkImportant', { title: task.title })
                : t('tasks.markImportant', { title: task.title })
            }
            className={cn(
              'mt-0.5 flex size-8 shrink-0 cursor-default items-center justify-center rounded-lg hover:bg-fill-hover pointer-coarse:size-11',
              task.important ? 'text-important' : 'text-text-tertiary',
            )}
          >
            <Star aria-hidden className={cn('size-5', task.important && 'fill-current')} />
          </button>
        </div>

        <AchievementInfo task={task} />

        <Subtasks task={task} disabled={!canEdit} />

        <div className="mt-5 divide-y divide-separator overflow-hidden rounded-xl bg-cell shadow-sm">
          <DetailRow icon={<Sun />}>
            <button
              type="button"
              onClick={() => actions.update({ id: task.id, input: { myDay: !task.inMyDay } })}
              aria-pressed={task.inMyDay}
              className={cn(
                'flex h-full w-full cursor-default items-center text-left text-callout',
                task.inMyDay ? 'font-medium text-accent-text' : 'text-text',
              )}
            >
              {task.inMyDay ? t('detail.inMyDay') : t('detail.addToMyDay')}
            </button>
            {task.inMyDay && (
              <IconButton
                label={t('detail.removeFromMyDay')}
                onClick={() => actions.update({ id: task.id, input: { myDay: false } })}
                className="-mr-1"
              >
                <X />
              </IconButton>
            )}
          </DetailRow>

          <DueEditor
            task={task}
            today={today}
            disabled={!canEdit}
            onChange={(input) => actions.update({ id: task.id, input })}
          />

          <RecurrenceEditor
            task={task}
            today={today}
            disabled={!canEdit}
            onChange={(recurrence) => actions.update({ id: task.id, input: { recurrence } })}
          />

          <ReminderEditor
            task={task}
            disabled={!canEdit}
            onChange={(remindAt) => actions.update({ id: task.id, input: { remindAt } })}
          />

          <DetailRow
            icon={<span className="text-callout font-bold">!</span>}
            label={t('detail.priority')}
          >
            <SegmentedControl
              aria-label={t('detail.priority')}
              className="w-full"
              value={String(task.priority)}
              onValueChange={(value) =>
                canEdit &&
                actions.update({ id: task.id, input: { priority: Number(value) as Priority } })
              }
              options={(['0', '1', '2', '3'] as const).map((value) => ({
                value,
                label: t(`tasks.priority.${value}`),
              }))}
            />
          </DetailRow>

          <DetailRow icon={<FolderInput />} label={t('detail.list')}>
            <Select
              aria-label={t('detail.list')}
              value={task.listId}
              disabled={!canEdit}
              onChange={(event) =>
                actions.update({
                  id: task.id,
                  input: { placement: { listId: event.target.value, after: null } },
                })
              }
            >
              {lists
                .filter((item) => item.role !== 'viewer')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.icon ? `${item.icon} ` : ''}
                    {item.name}
                  </option>
                ))}
            </Select>
          </DetailRow>

          {list && (list.memberCount > 1 || task.assignee) && (
            <AssigneeEditor
              task={task}
              list={list}
              disabled={!canEdit}
              onChange={(assigneeId) => actions.update({ id: task.id, input: { assigneeId } })}
            />
          )}

          <TagsEditor
            task={task}
            disabled={!canEdit}
            onChange={(tags) => actions.update({ id: task.id, input: { tags } })}
          />
        </div>

        <NotesEditor
          task={task}
          disabled={!canEdit}
          onSave={(notes) => actions.update({ id: task.id, input: { notes } })}
        />

        <TaskAttachments task={task} disabled={!canEdit} />

        <div className="mt-6 flex items-center justify-between gap-3 text-footnote text-text-secondary">
          <span>
            {task.completedAt
              ? t('detail.completed', { date: formatDate(task.completedAt, i18n.language) })
              : t('detail.created', { date: formatDate(task.createdAt, i18n.language) })}
          </span>
          {canEdit && (
            <Button
              variant="destructive-plain"
              size="sm"
              onClick={() => {
                deleteTask.mutate(task)
                onClose()
              }}
            >
              <Trash2 aria-hidden />
              {t('detail.delete')}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function TitleEditor({
  task,
  disabled,
  completed,
  onSave,
}: {
  task: Task
  disabled: boolean
  completed: boolean
  onSave: (title: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(task.title)
  const save = () => {
    const title = value.replace(/\s+/g, ' ').trim()
    if (!title) setValue(task.title)
    else if (title !== task.title) onSave(title)
  }
  return (
    <AutoTextarea
      value={value}
      disabled={disabled}
      aria-label={t('detail.title')}
      maxLength={500}
      onChange={(event) => setValue(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
      }}
      className={cn(
        'mt-1 min-w-0 flex-1 rounded-md px-1 text-title3 font-semibold focus-visible:bg-fill-hover',
        completed && 'text-text-secondary line-through',
      )}
    />
  )
}

function Subtasks({ task, disabled }: { task: Task; disabled: boolean }) {
  const { t } = useTranslation()
  const add = useAddSubtask()
  const update = useUpdateSubtask()
  const remove = useDeleteSubtask()
  const [title, setTitle] = useState('')
  const inputId = useId()

  return (
    <section aria-label={t('detail.steps')} className="mt-3 ml-1">
      <ul className="flex flex-col">
        {task.subtasks.map((subtask) => (
          <li
            key={subtask.id}
            className="group/step flex items-center gap-1 rounded-lg hover:bg-fill-hover"
          >
            <TaskCheckbox
              size="sm"
              checked={subtask.completedAt !== null}
              disabled={disabled}
              onCheckedChange={(completed) =>
                update.mutate({ taskId: task.id, id: subtask.id, input: { completed } })
              }
              label={
                subtask.completedAt
                  ? t('detail.stepReopen', { title: subtask.title })
                  : t('detail.stepComplete', { title: subtask.title })
              }
            />
            <StepTitle
              title={subtask.title}
              completed={subtask.completedAt !== null}
              disabled={disabled}
              onSave={(value) =>
                update.mutate({ taskId: task.id, id: subtask.id, input: { title: value } })
              }
            />
            {!disabled && (
              <IconButton
                label={t('detail.deleteStep', { title: subtask.title })}
                showTooltip={false}
                onClick={() => remove.mutate({ taskId: task.id, id: subtask.id })}
                className="opacity-0 group-focus-within/step:opacity-100 group-hover/step:opacity-100 pointer-coarse:opacity-100"
              >
                <X />
              </IconButton>
            )}
          </li>
        ))}
      </ul>
      {!disabled && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const trimmed = title.trim()
            if (!trimmed) return
            add.mutate({ taskId: task.id, id: newTaskId(), title: trimmed })
            setTitle('')
          }}
          className="flex items-center gap-1"
        >
          <label
            htmlFor={inputId}
            className="flex size-7 shrink-0 items-center justify-center text-accent-text pointer-coarse:size-10"
          >
            <Plus aria-hidden className="size-4" />
            <span className="sr-only">{t('detail.addStep')}</span>
          </label>
          <input
            id={inputId}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={t('detail.addStep')}
            maxLength={500}
            enterKeyHint="done"
            autoComplete="off"
            className="h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-callout outline-none focus-visible:bg-fill-hover"
          />
        </form>
      )}
    </section>
  )
}

function StepTitle({
  title,
  completed,
  disabled,
  onSave,
}: {
  title: string
  completed: boolean
  disabled: boolean
  onSave: (title: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(title)
  return (
    <input
      value={value}
      disabled={disabled}
      aria-label={t('detail.stepTitle')}
      maxLength={500}
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => {
        const trimmed = value.trim()
        if (!trimmed) setValue(title)
        else if (trimmed !== title) onSave(trimmed)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      className={cn(
        'h-9 min-w-0 flex-1 rounded-md bg-transparent px-1 text-callout outline-none focus-visible:bg-cell',
        completed && 'text-text-secondary line-through',
      )}
    />
  )
}

function DueEditor({
  task,
  today,
  disabled,
  onChange,
}: {
  task: Task
  today: string
  disabled: boolean
  onChange: (input: { dueDate?: string | null; dueTime?: string | null }) => void
}) {
  const { t } = useTranslation()
  const nextMonday = addDays(today, 7 - isoWeekday(today))
  const quick = [
    { label: t('tasks.today'), date: today },
    { label: t('tasks.tomorrow'), date: addDays(today, 1) },
    { label: t('detail.nextWeek'), date: nextMonday },
  ]

  return (
    <>
      <DetailRow icon={<CalendarDays />} label={t('detail.dueDate')}>
        <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
          <div className="flex items-center gap-2">
            <input
              type="date"
              aria-label={t('detail.dueDate')}
              value={task.dueDate ?? ''}
              disabled={disabled}
              onChange={(event) => onChange({ dueDate: event.target.value || null })}
              className={cn(inputClassName, 'h-8 min-w-0 flex-1 text-callout')}
            />
            {task.dueDate && !disabled && (
              <IconButton label={t('detail.removeDue')} onClick={() => onChange({ dueDate: null })}>
                <X />
              </IconButton>
            )}
          </div>
          {!disabled && (
            <div className="flex flex-wrap gap-1.5">
              {quick.map((option) => (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => onChange({ dueDate: option.date })}
                  aria-pressed={task.dueDate === option.date}
                  className={cn(
                    'h-7 cursor-default rounded-full px-3 text-footnote font-medium transition-colors pointer-coarse:h-9',
                    task.dueDate === option.date
                      ? 'bg-accent text-on-accent'
                      : 'bg-fill-control text-text hover:bg-fill-pressed',
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </DetailRow>
      {task.dueDate && (
        <DetailRow icon={<Clock />} label={t('detail.dueTime')}>
          <input
            type="time"
            aria-label={t('detail.dueTime')}
            value={task.dueTime ?? ''}
            disabled={disabled}
            onChange={(event) => onChange({ dueTime: event.target.value || null })}
            className={cn(inputClassName, 'h-8 min-w-0 flex-1 text-callout')}
          />
          {task.dueTime && !disabled && (
            <IconButton label={t('detail.removeTime')} onClick={() => onChange({ dueTime: null })}>
              <X />
            </IconButton>
          )}
        </DetailRow>
      )}
    </>
  )
}

function NotesEditor({
  task,
  disabled,
  onSave,
}: {
  task: Task
  disabled: boolean
  onSave: (notes: string) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(task.notes)
  const [preview, setPreview] = useState(task.notes.trim().length > 0)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const valueRef = useRef(value)
  const savedRef = useRef(task.notes)
  const onSaveRef = useRef(onSave)
  const labelId = useId()

  useEffect(() => {
    valueRef.current = value
  }, [value])
  useEffect(() => {
    onSaveRef.current = onSave
  }, [onSave])

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    if (valueRef.current !== savedRef.current) {
      savedRef.current = valueRef.current
      onSaveRef.current(valueRef.current)
    }
  }, [])

  // Save what is left when the panel closes.
  useEffect(() => flush, [flush])

  return (
    <section aria-labelledby={labelId} className="mt-5">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h3
          id={labelId}
          className="flex items-center gap-1.5 text-subhead font-semibold text-text-secondary"
        >
          <NotebookText aria-hidden className="size-4" />
          {t('detail.notes')}
        </h3>
        {!disabled && value.trim() && (
          <Button variant="plain" size="sm" onClick={() => setPreview((current) => !current)}>
            {preview ? t('detail.editNotes') : t('detail.preview')}
          </Button>
        )}
      </div>
      {preview && value.trim() ? (
        <div className="markdown rounded-xl bg-cell p-3 text-callout shadow-sm">
          {/* The plain text shows while the Markdown renderer loads. */}
          <Suspense fallback={<p className="whitespace-pre-wrap">{value}</p>}>
            <Markdown>{value}</Markdown>
          </Suspense>
        </div>
      ) : (
        <AutoTextarea
          value={value}
          disabled={disabled}
          aria-labelledby={labelId}
          placeholder={t('detail.notesPlaceholder')}
          maxLength={20_000}
          onChange={(event) => {
            setValue(event.target.value)
            clearTimeout(timer.current)
            timer.current = setTimeout(flush, NOTES_SAVE_DELAY)
          }}
          onBlur={flush}
          className="min-h-24 rounded-xl bg-cell p-3 text-callout shadow-sm focus-visible:ring-4 focus-visible:ring-accent-soft"
        />
      )}
    </section>
  )
}
