import { useQuery } from '@tanstack/react-query'
import { useNavigate, useRouterState, useSearch } from '@tanstack/react-router'
import { Search, SearchX, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { EmptyState } from '../../components/ui/empty-state'
import { TaskListSkeleton } from '../../components/ui/task-skeleton'
import { cn } from '../../lib/cn'
import { Page } from '../shell/page'
import { searchQuery } from './data'
import { useListsById, useToday } from './hooks'
import { useTaskActions } from './task-actions'
import { TaskList } from './task-list'

/**
 * Search field for the sidebar and the search page. Typing navigates to
 * `/search?q=…` (replacing history entries), so the query survives reloads.
 */
export function SearchField({
  className,
  onSearch,
}: {
  className?: string
  onSearch?: () => void
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const search: { q?: string } = useSearch({ strict: false })
  // While typing, the field shows a local draft; otherwise it follows the URL
  // (so Back and links update it, too).
  const [draft, setDraft] = useState<string | null>(null)
  const value = draft ?? (pathname === '/search' ? (search.q ?? '') : '')
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(timer.current), [])

  const update = (next: string) => {
    setDraft(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      const q = next.trim()
      if (q || pathname === '/search') {
        void navigate({ to: '/search', search: q ? { q } : {}, replace: pathname === '/search' })
        onSearch?.()
      }
      setDraft(null)
    }, 250)
  }

  return (
    <div role="search" className={cn('relative', className)}>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-text-secondary"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => update(event.target.value)}
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        className="h-8 w-full rounded-lg bg-fill-control pr-8 pl-8 text-callout text-text outline-none placeholder:text-text-tertiary focus-visible:ring-4 focus-visible:ring-accent-soft pointer-coarse:h-11 [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => update('')}
          aria-label={t('search.clear')}
          className="absolute top-1/2 right-1 flex size-6 -translate-y-1/2 cursor-default items-center justify-center rounded-full text-text-secondary hover:text-text pointer-coarse:size-9"
        >
          <X aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export function SearchPage() {
  const { t } = useTranslation()
  const search: { q?: string } = useSearch({ strict: false })
  const query = (search.q ?? '').trim()
  const results = useQuery(searchQuery(query))
  const today = useToday()
  const listsById = useListsById()
  const actions = useTaskActions()

  return (
    <Page title={t('search.title')}>
      {/* The sidebar is a drawer on phones, so the page brings its own field. */}
      <SearchField className="mb-4 md:hidden" />
      {!query ? (
        <EmptyState icon={<Search />} title={t('search.label')} body={t('search.hint')} />
      ) : results.isPending ? (
        <TaskListSkeleton />
      ) : (results.data ?? []).length === 0 ? (
        <EmptyState
          icon={<SearchX />}
          title={t('search.empty')}
          body={t('search.emptyBody', { query })}
        />
      ) : (
        <div aria-live="polite">
          <TaskList
            tasks={results.data ?? []}
            today={today}
            actions={actions}
            listsById={listsById}
            label={t('search.title')}
          />
        </div>
      )}
    </Page>
  )
}
