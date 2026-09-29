import { addDays, type CreateTaskInput, type SmartView, type Task } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarClock,
  CalendarDays,
  CircleCheck,
  Inbox,
  Lightbulb,
  Plus,
  Star,
  Sun,
  UserCheck,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '../../components/ui/badge'
import { EmptyState } from '../../components/ui/empty-state'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { Spinner } from '../../components/ui/spinner'
import { formatLongDate } from '../../lib/format'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'
import {
  groupsQuery,
  listsQuery,
  suggestionsQuery,
  taskKeys,
  useUpdateTask,
  viewQuery,
} from './data'
import { useListsById, useToday } from './hooks'
import { ListIcon } from './list-style'
import { QuickAdd } from './quick-add'
import { listsInSidebarOrder } from './sidebar-model'
import { useTaskActions } from './task-actions'
import { CompletedSection, TaskList } from './task-list'
import { listSections, matchesView, plannedSections, splitByCompletion } from './view-logic'

const EMPTY_ICON: Record<SmartView, ReactNode> = {
  'my-day': <Sun />,
  important: <Star />,
  planned: <CalendarDays />,
  overdue: <CalendarClock />,
  assigned: <UserCheck />,
  all: <Inbox />,
  completed: <CircleCheck />,
}

/** Defaults for tasks added in a smart list, so they show up where they were added. */
function quickAddDefaults(
  view: SmartView,
  today: string,
): Omit<CreateTaskInput, 'title' | 'id'> | null {
  switch (view) {
    case 'my-day':
      return { myDay: true }
    case 'important':
      return { important: true }
    case 'planned':
      return { dueDate: today }
    case 'all':
      return {}
    case 'overdue':
    case 'assigned':
    case 'completed':
      return null
  }
}

export function SmartViewPage({ view }: { view: SmartView }) {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const today = useToday()
  const query = useQuery(viewQuery(view))
  const { data: lists = [] } = useQuery(listsQuery)
  const { data: groups = [] } = useQuery(groupsQuery)
  const listsById = useListsById()
  const actions = useTaskActions()
  const defaults = quickAddDefaults(view, today)

  // Keeps the cached result consistent right after local changes.
  const tasks = (query.data ?? []).filter((task) => matchesView(task, view, today, me.id))
  const { open, completed } = splitByCompletion(tasks)

  const common = { today, actions, listsById }
  let content: ReactNode
  if (query.isPending) {
    content = (
      <div className="flex justify-center py-10">
        <Spinner className="size-5" label={t('common.loading')} />
      </div>
    )
  } else if (tasks.length === 0) {
    content = (
      <EmptyState
        icon={EMPTY_ICON[view]}
        title={t(`views.empty.${view}`)}
        body={t(`views.empty.${view}-body`)}
      />
    )
  } else if (view === 'planned') {
    content = plannedSections(open, today).map((section) => (
      <Section key={section.key} title={t(`views.planned_sections.${section.key}`)}>
        <TaskList
          tasks={section.tasks}
          label={t(`views.planned_sections.${section.key}`)}
          {...common}
        />
      </Section>
    ))
  } else if (view === 'all') {
    content = listSections(open, listsInSidebarOrder(lists, groups)).map((section) => {
      const list = listsById.get(section.key)
      if (!list) return null
      // The name stays in the text color: list colors are only meant for icons and
      // large titles (3:1), not for small text (4.5:1).
      return (
        <Section
          key={section.key}
          title={list.name}
          icon={<ListIcon list={list} />}
          titleClassName="text-text"
        >
          <TaskList tasks={section.tasks} label={list.name} today={today} actions={actions} />
        </Section>
      )
    })
  } else if (view === 'completed') {
    content = <TaskList tasks={completed} label={t('views.completed')} {...common} />
  } else {
    content = (
      <>
        <TaskList tasks={open} label={t(`views.${view}`)} {...common} />
        {view === 'my-day' && (
          <CompletedSection tasks={completed} storageKey="my-day" {...common} />
        )}
      </>
    )
  }

  return (
    <Page
      title={t(`views.${view}`)}
      subtitle={
        view === 'my-day' ? formatLongDate(new Date(), i18n.language, me.timezone) : undefined
      }
      actions={view === 'my-day' ? <Suggestions today={today} /> : undefined}
    >
      {defaults && <QuickAdd defaults={defaults} optimisticKeys={[taskKeys.view(view)]} />}
      {content}
    </Page>
  )
}

function Section({
  title,
  icon,
  titleClassName,
  children,
}: {
  title: string
  icon?: ReactNode
  titleClassName?: string
  children: ReactNode
}) {
  return (
    <section className="mt-5 first:mt-0">
      <h2
        className={`mb-1 flex items-center gap-1.5 px-2 text-subhead font-semibold ${titleClassName ?? 'text-text-secondary'}`}
      >
        {icon}
        {title}
      </h2>
      {children}
    </section>
  )
}

type SuggestionReason = 'overdue' | 'today' | 'soon' | 'recent'

function reasonFor(task: Task, today: string): SuggestionReason {
  if (!task.dueDate) return 'recent'
  if (task.dueDate < today) return 'overdue'
  if (task.dueDate === today) return 'today'
  return task.dueDate <= addDays(today, 2) ? 'soon' : 'recent'
}

/** The lightbulb in My Day: overdue, soon due and recently added tasks. */
function Suggestions({ today }: { today: string }) {
  const { t } = useTranslation()
  const query = useQuery(suggestionsQuery)
  const listsById = useListsById()
  const update = useUpdateTask()
  const suggestions = (query.data ?? []).filter((task) => !task.inMyDay)

  return (
    <Popover>
      <PopoverTrigger className="flex h-8 cursor-default items-center gap-1.5 rounded-lg px-2.5 text-callout font-medium text-accent-text hover:bg-fill-hover data-[state=open]:bg-fill-selected pointer-coarse:h-11">
        <Lightbulb aria-hidden className="size-4.5" />
        {t('views.suggestions')}
      </PopoverTrigger>
      <PopoverContent aria-label={t('views.suggestionsTitle')}>
        <h2 className="px-2 pt-1 pb-2 text-callout font-semibold">{t('views.suggestionsTitle')}</h2>
        {query.isPending ? (
          <div className="flex justify-center py-6">
            <Spinner label={t('common.loading')} />
          </div>
        ) : suggestions.length === 0 ? (
          <p className="px-2 pb-3 text-callout text-text-secondary">
            {t('views.suggestionsEmpty')}
          </p>
        ) : (
          <ul className="flex max-h-96 flex-col overflow-y-auto">
            {suggestions.map((task) => {
              const list = listsById.get(task.listId)
              const reason = reasonFor(task, today)
              return (
                <li
                  key={task.id}
                  className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-fill-hover"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-callout">{task.title}</p>
                    <p className="flex items-center gap-2 text-footnote text-text-secondary">
                      <Badge tone={reason === 'overdue' ? 'danger' : 'neutral'}>
                        {t(`views.suggestionReason.${reason}`)}
                      </Badge>
                      {list && <span className="truncate">{list.name}</span>}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={t('views.addToMyDay', { title: task.title })}
                    onClick={() => update.mutate({ id: task.id, input: { myDay: true } })}
                    className="flex size-8 shrink-0 cursor-default items-center justify-center rounded-full text-accent-text hover:bg-accent-soft pointer-coarse:size-11"
                  >
                    <Plus aria-hidden className="size-5" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  )
}
