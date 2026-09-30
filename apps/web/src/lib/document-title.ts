import { useEffect, useSyncExternalStore } from 'react'

const APP_NAME = 'Crystal'
const listeners = new Set<() => void>()
let current = APP_NAME

/** Sets the browser tab's title to “<page> · Crystal” while the page is shown. */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    current = title ? `${title} · ${APP_NAME}` : APP_NAME
    document.title = current
    for (const listener of listeners) listener()
  }, [title])
}

/** The current page title, for announcing page changes. */
export function useCurrentTitle(): string {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
  )
}
