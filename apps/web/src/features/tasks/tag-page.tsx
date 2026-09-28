import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Hash } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { Page } from '../shell/page'
import { tagsQuery, tagTasksQuery, taskKeys } from './data'
import { useListsById, useToday } from './hooks'
import { QuickAdd } from './quick-add'
import { useTaskActions } from './task-actions'
import { CompletedSection, TaskList } from './task-list'
import { splitByCompletion } from './view-logic'

const route = getRouteApi('/_app/tags/$tag')

/** All tasks with one tag, across lists. New tasks get the tag. */
export function TagPage() {
  const { t } = useTranslation()
  const { tag } = route.useParams()
  const query = useQuery(tagTasksQuery(tag))
  const today = useToday()
  const listsById = useListsById()
  const actions = useTaskActions()

  // Tasks whose tag was just removed disappear right away, before the refetch.
  const tasks = (query.data ?? []).filter((task) => task.tags.includes(tag))
  const { open, completed } = splitByCompletion(tasks)

  return (
    <Page title={`#${tag}`}>
      <QuickAdd defaults={{ tags: [tag] }} optimisticKeys={[taskKeys.tagTasks(tag)]} />
      {query.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" label={t('common.loading')} />
        </div>
      ) : open.length === 0 && completed.length === 0 ? (
        <EmptyState icon={<Hash />} title={t('tags.empty')} body={t('tags.emptyBody', { tag })} />
      ) : (
        <>
          <TaskList
            tasks={open}
            today={today}
            actions={actions}
            listsById={listsById}
            label={`#${tag}`}
          />
          <CompletedSection
            tasks={completed}
            today={today}
            actions={actions}
            listsById={listsById}
            storageKey={`tag:${tag}`}
          />
        </>
      )}
    </Page>
  )
}

/** The tags in use, in the sidebar below the lists. */
export function SidebarTags({ onNavigate }: { onNavigate: (() => void) | undefined }) {
  const { t } = useTranslation()
  const { data: tags = [] } = useQuery(tagsQuery)
  if (tags.length === 0) return null
  return (
    <>
      <h2 className="mt-5 mb-1 px-1.5 text-footnote font-semibold text-text-secondary">
        {t('tags.title')}
      </h2>
      <ul aria-label={t('tags.title')} className="flex flex-col gap-0.5">
        {tags.map((tag) => (
          <li key={tag.name}>
            <Link
              to="/tags/$tag"
              params={{ tag: tag.name }}
              onClick={onNavigate}
              className="flex h-8 cursor-default items-center gap-2 rounded-lg pr-2.5 pl-1.5 text-callout transition-colors hover:bg-fill-hover data-[status=active]:bg-fill-selected data-[status=active]:font-medium pointer-coarse:h-11"
            >
              <Hash aria-hidden className="size-4 shrink-0 text-text-secondary" />
              <span className="min-w-0 flex-1 truncate">{tag.name}</span>
              {tag.openCount > 0 && (
                <span className="text-footnote text-text-secondary tabular-nums">
                  {tag.openCount}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </>
  )
}
