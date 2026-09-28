import { todayIn, type List } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useCallback, useMemo } from 'react'

import { useMe } from '../shell/use-me'
import { listsQuery } from './data'

/** Today in the user's time zone (`YYYY-MM-DD`). */
export function useToday(): string {
  const me = useMe()
  return todayIn(me.timezone)
}

export function useListsById(): Map<string, List> {
  const { data: lists } = useQuery(listsQuery)
  return useMemo(() => new Map((lists ?? []).map((list) => [list.id, list])), [lists])
}

/** The task shown in the detail panel lives in the URL (`?task=…`), so Back closes it. */
export function useTaskSelection() {
  const navigate = useNavigate()
  const search: { task?: string } = useSearch({ strict: false })
  const selectedId = search.task

  const open = useCallback(
    (id: string) => {
      void navigate({
        to: '.',
        search: (previous: Record<string, unknown>) => ({ ...previous, task: id }),
      })
    },
    [navigate],
  )
  const close = useCallback(() => {
    void navigate({
      to: '.',
      search: (previous: Record<string, unknown>) => ({ ...previous, task: undefined }),
    })
  }, [navigate])

  return { selectedId, open, close }
}
