import { useCallback, useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches)
}

/** Sidebar and detail panel sit side by side from this width on. */
export const DESKTOP_QUERY = '(min-width: 768px)'
/** Settings show their section list next to the content from this width on. */
export const WIDE_QUERY = '(min-width: 1024px)'
