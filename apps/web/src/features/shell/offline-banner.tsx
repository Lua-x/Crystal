import { onlineManager, useMutationState } from '@tanstack/react-query'
import { CloudOff, RefreshCw } from 'lucide-react'
import { useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'

function useOnline(): boolean {
  return useSyncExternalStore(
    (listener) => onlineManager.subscribe(listener),
    () => onlineManager.isOnline(),
  )
}

/**
 * Says when Crystal is offline – changes are kept and sent later – and while
 * those changes are being sent after the connection came back.
 */
export function OfflineBanner() {
  const { t } = useTranslation()
  const online = useOnline()
  const waiting = useMutationState({
    filters: { status: 'pending' },
    select: (mutation) => mutation.state.isPaused,
  }).filter(Boolean).length

  const message = !online ? t('app.offline') : waiting > 0 ? t('app.syncing') : null
  return (
    <div role="status" className="empty:hidden">
      {message && (
        <p className="flex items-center justify-center gap-2 bg-fill-control px-4 py-1.5 text-center text-footnote text-text">
          {online ? (
            <RefreshCw aria-hidden className="size-3.5 animate-spin motion-reduce:animate-none" />
          ) : (
            <CloudOff aria-hidden className="size-3.5" />
          )}
          {message}
        </p>
      )}
    </div>
  )
}
