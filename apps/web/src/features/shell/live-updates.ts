import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'

import { CLIENT_ID } from '../../lib/api'
import { mapKeys } from '../games/map-data'
import { refresh, refreshTaskData, taskKeys } from '../tasks/data'

/** Changes often come in bursts (e.g. completing several tasks); refresh once. */
const SETTLE_MS = 150

/**
 * Keeps open apps up to date: the server announces changes to shared lists
 * (and from one's other tabs) over Server-Sent Events, and the affected data
 * is fetched again. The browser reconnects on its own after a network hiccup
 * or a server restart; everything is refreshed then, as changes may have been
 * missed in between.
 */
export function useLiveUpdates(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const source = new EventSource(`/api/v1/events?client=${encodeURIComponent(CLIENT_ID)}`)
    let connectedBefore = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const refreshSoon = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        refreshTaskData(queryClient)
        refresh(queryClient, taskKeys.groups)
        refresh(queryClient, mapKeys.all)
      }, SETTLE_MS)
    }

    source.addEventListener('ready', () => {
      if (connectedBefore) refreshSoon()
      connectedBefore = true
    })
    source.addEventListener('changed', refreshSoon)

    return () => {
      clearTimeout(timer)
      source.close()
    }
  }, [queryClient])
}
