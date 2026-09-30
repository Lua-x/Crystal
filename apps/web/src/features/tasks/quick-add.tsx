import type { TFunction } from 'i18next'
import {
  parseQuickEntry,
  type CreateTaskInput,
  type Locale,
  type QuickEntryResult,
  type QuickEntryToken,
} from '@crystal/shared'
import { useQuery, type QueryKey } from '@tanstack/react-query'
import { CalendarDays, Clock, Flag, FolderInput, Hash, Plus, Repeat, Star, X } from 'lucide-react'
import { AnimatePresence, m } from 'motion/react'
import { useEffect, useId, useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { springs } from '../../lib/motion'
import { useMe } from '../shell/use-me'
import { listsQuery, newTaskId, useCreateTask } from './data'
import { useToday } from './hooks'
import { describeRecurrence } from './recurrence-text'
import { formatDue, formatTime } from './view-logic'

type Defaults = Omit<CreateTaskInput, 'title' | 'id'>

interface QuickAddProps {
  /** Applied to every new task, e.g. `{ listId }` or `{ myDay: true }`. */
  defaults: Defaults
  /** Task arrays where the new task should appear immediately. */
  optimisticKeys: QueryKey[]
}

/**
 * "Add a task": type and press Enter; the field stays focused for the next one.
 * Dates, repeats, tags and more are recognized while typing and shown as chips;
 * dismissing a chip keeps that part as plain text.
 */
export function QuickAdd({ defaults, optimisticKeys }: QuickAddProps) {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const today = useToday()
  const { data: lists = [] } = useQuery(listsQuery)
  const [title, setTitle] = useState('')
  const [ignored, setIgnored] = useState<string[]>([])
  const create = useCreateTask(optimisticKeys)
  const inputId = useId()
  const chipsId = useId()
  const locale = i18n.language as Locale

  const writableLists = useMemo(() => lists.filter((list) => list.role !== 'viewer'), [lists])
  const parsed = useMemo(
    () =>
      me.preferences.smartEntry && title.trim()
        ? parseQuickEntry(title, { today, locale, lists: writableLists, ignore: ignored })
        : null,
    [me.preferences.smartEntry, title, today, locale, writableLists, ignored],
  )
  const tokens = parsed?.tokens ?? []
  const labels = tokens.map((token) => chipLabel(token, parsed!, { t, locale, today, lists }))
  const announcement = useDebouncedAnnouncement(
    labels.length > 0 ? t('quickEntry.summary', { items: labels.join(', ') }) : '',
  )

  const submit = () => {
    const trimmed = title.trim()
    if (!trimmed) return
    create.mutate({
      ...defaults,
      ...fieldsFrom(parsed, defaults),
      id: newTaskId(),
      title: parsed?.title ?? trimmed,
    })
    setTitle('')
    setIgnored([])
  }

  return (
    <div className="mb-3">
      <form
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
        className="flex h-11 items-center gap-2 rounded-xl bg-fill-control px-3 transition-shadow focus-within:ring-4 focus-within:ring-accent-soft pointer-coarse:h-12"
      >
        <label htmlFor={inputId} className="flex shrink-0 text-accent-text">
          <Plus aria-hidden className="size-5" />
          <span className="sr-only">{t('tasks.add')}</span>
        </label>
        <input
          id={inputId}
          data-quick-add
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (!event.target.value) setIgnored([])
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && title) {
              event.stopPropagation()
              setTitle('')
              setIgnored([])
            }
          }}
          placeholder={t('tasks.addPlaceholder')}
          maxLength={500}
          enterKeyHint="done"
          autoComplete="off"
          aria-describedby={tokens.length > 0 ? chipsId : undefined}
          className="h-full min-w-0 flex-1 bg-transparent text-body outline-none"
        />
      </form>

      <AnimatePresence initial={false}>
        {tokens.length > 0 && (
          <m.ul
            id={chipsId}
            aria-label={t('quickEntry.recognized')}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={springs.snappy}
            className="flex flex-wrap gap-1.5 overflow-hidden px-1 pt-2"
          >
            {tokens.map((token, index) => (
              <li key={`${token.kind}-${token.start}`}>
                <span className="inline-flex h-7 items-center gap-1 rounded-full bg-accent-soft pr-0.5 pl-2.5 text-footnote font-medium text-text pointer-coarse:h-9">
                  <span aria-hidden className="flex text-accent-text [&_svg]:size-3.5">
                    {CHIP_ICONS[token.kind]}
                  </span>
                  {labels[index]}
                  <button
                    type="button"
                    onClick={() => setIgnored((current) => [...current, token.text])}
                    aria-label={t('quickEntry.keepAsText', { text: token.text })}
                    className="flex size-6 cursor-default items-center justify-center rounded-full text-text-secondary hover:bg-fill-hover hover:text-text pointer-coarse:size-8"
                  >
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              </li>
            ))}
          </m.ul>
        )}
      </AnimatePresence>
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}

const CHIP_ICONS: Record<QuickEntryToken['kind'], ReactNode> = {
  date: <CalendarDays />,
  time: <Clock />,
  recurrence: <Repeat />,
  important: <Star />,
  priority: <Flag />,
  tag: <Hash />,
  list: <FolderInput />,
}

/** What the recognized parts add to (or change in) the defaults of the page. */
function fieldsFrom(parsed: QuickEntryResult | null, defaults: Defaults): Defaults {
  if (!parsed) return {}
  const fields: Defaults = {}
  if (parsed.dueDate) {
    fields.dueDate = parsed.dueDate
    fields.dueTime = parsed.dueTime
  }
  if (parsed.recurrence) fields.recurrence = parsed.recurrence
  if (parsed.important) fields.important = true
  if (parsed.priority !== null) fields.priority = parsed.priority
  if (parsed.tags.length > 0) fields.tags = [...(defaults.tags ?? []), ...parsed.tags]
  if (parsed.listId) fields.listId = parsed.listId
  return fields
}

function chipLabel(
  token: QuickEntryToken,
  parsed: QuickEntryResult,
  context: {
    t: TFunction
    locale: string
    today: string
    lists: { id: string; name: string }[]
  },
): string {
  const { t, locale, today } = context
  switch (token.kind) {
    case 'date':
      return (
        formatDue({ dueDate: parsed.dueDate, dueTime: null }, today, locale, {
          today: t('tasks.today'),
          tomorrow: t('tasks.tomorrow'),
          yesterday: t('tasks.yesterday'),
        }) ?? token.text
      )
    case 'time':
      return parsed.dueTime ? formatTime(parsed.dueTime, locale) : token.text
    case 'recurrence':
      return parsed.recurrence ? describeRecurrence(parsed.recurrence, t, locale) : token.text
    case 'important':
      return t('quickEntry.important')
    case 'priority':
      return t('tasks.priorityLabel', {
        level: t(`tasks.priority.${parsed.priority ?? 1}` as 'tasks.priority.1'),
      })
    case 'tag':
      return `#${token.value ?? ''}`
    case 'list':
      return t('quickEntry.inList', {
        list: context.lists.find((list) => list.id === token.value)?.name ?? token.text,
      })
  }
}

/** Announces what was recognized once typing pauses, not on every key. */
function useDebouncedAnnouncement(text: string): string {
  const [announced, setAnnounced] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setAnnounced(text), 700)
    return () => clearTimeout(timer)
  }, [text])
  return announced
}
