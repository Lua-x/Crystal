import { useTranslation } from 'react-i18next'

const WIDTHS = ['62%', '45%', '74%', '38%', '56%']

/**
 * Placeholder rows while tasks load. They only fade in after a moment, so
 * quick loads never flash, and they keep the page from jumping once the
 * tasks arrive.
 */
export function TaskListSkeleton({ rows = 4 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" className="flex skeleton-appear flex-col py-1">
      <span className="sr-only">{t('common.loading')}</span>
      {WIDTHS.slice(0, rows).map((width) => (
        <div key={width} aria-hidden className="flex min-h-12 items-center gap-3 pr-3 pl-2.5">
          <span className="size-5.5 shrink-0 rounded-full border-2 border-fill-control" />
          <span className="animate-pulse h-3.5 rounded-full bg-fill-control" style={{ width }} />
        </div>
      ))}
    </div>
  )
}
