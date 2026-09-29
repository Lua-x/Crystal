import { useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'

import { safeRedirect } from '../../lib/errors'

/**
 * A clicked notification asks an open Crystal window (instead of a new one)
 * to show its page; the service worker sends the path as a message.
 */
export function useNotificationClicks(): void {
  const navigate = useNavigate()
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: unknown; path?: unknown } | null
      if (data?.type !== 'crystal:navigate' || typeof data.path !== 'string') return
      void navigate({ href: safeRedirect(data.path) })
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])
}
