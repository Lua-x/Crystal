import type { Stats } from '@crystal/shared'
import { queryOptions, useQuery } from '@tanstack/react-query'
import { CircleCheck, Flame, ListTodo, Trophy } from 'lucide-react'
import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Spinner } from '../../components/ui/spinner'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { Page } from '../shell/page'

const statsQuery = queryOptions({
  queryKey: ['stats'],
  queryFn: () => api<Stats>('/stats'),
})

export function StatsPage() {
  const { t } = useTranslation()
  const stats = useQuery(statsQuery)

  return (
    <Page title={t('stats.title')} variant="grouped">
      {stats.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" label={t('common.loading')} />
        </div>
      ) : stats.isError ? (
        <Alert>{errorMessage(stats.error)}</Alert>
      ) : (
        <StatsContent stats={stats.data} />
      )}
    </Page>
  )
}

function StatsContent({ stats }: { stats: Stats }) {
  const { t } = useTranslation()
  const days = (count: number) => t('stats.days', { count })
  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile icon={<CircleCheck />} label={t('stats.today')} value={stats.completedToday} />
        <Tile
          icon={<Flame />}
          label={t('stats.streak')}
          value={days(stats.streak.current)}
          detail={t('stats.longest', { days: days(stats.streak.longest) })}
        />
        <Tile icon={<Trophy />} label={t('stats.total')} value={stats.completedTotal} />
        <Tile
          icon={<ListTodo />}
          label={t('stats.open')}
          value={stats.open}
          detail={stats.overdue > 0 ? t('stats.overdue', { count: stats.overdue }) : undefined}
        />
      </div>
      <WeekChart weeks={stats.weeks} />
      <p className="px-1 text-footnote text-text-secondary">{t('stats.hint')}</p>
    </div>
  )
}

function Tile({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode
  label: string
  value: ReactNode
  detail?: string | undefined
}) {
  const headingId = useId()
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-1 rounded-xl bg-cell p-4 shadow-sm"
    >
      <h2
        id={headingId}
        className="flex items-center gap-1.5 text-footnote font-semibold text-text-secondary [&_svg]:size-4 [&_svg]:text-accent-text"
      >
        <span aria-hidden className="flex">
          {icon}
        </span>
        {label}
      </h2>
      <p className="text-title2 font-bold tabular-nums">{value}</p>
      {detail && <p className="text-footnote text-text-secondary">{detail}</p>}
    </section>
  )
}

function WeekChart({ weeks }: { weeks: Stats['weeks'] }) {
  const { t, i18n } = useTranslation()
  const max = Math.max(1, ...weeks.map((week) => week.completed))
  const format = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })

  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="rounded-xl bg-cell p-4 shadow-sm">
      <h2 id={headingId} className="text-subhead font-semibold">
        {t('stats.perWeek')}
      </h2>
      <ol className="mt-4 flex h-44 items-end gap-1.5 sm:gap-2.5">
        {weeks.map((week, index) => {
          const current = index === weeks.length - 1
          const date = format.format(new Date(`${week.start}T00:00:00Z`))
          return (
            <li
              key={week.start}
              className="flex h-full min-w-0 flex-1 flex-col items-center gap-1.5"
            >
              <span className="sr-only">{t('stats.week', { date, count: week.completed })}</span>
              <span aria-hidden className="text-caption text-text-secondary tabular-nums">
                {week.completed > 0 ? week.completed : ''}
              </span>
              <span aria-hidden className="flex w-full flex-1 items-end">
                <span
                  className={cn(
                    'w-full rounded-t-md transition-[height] duration-500',
                    current ? 'bg-accent' : 'bg-accent-soft',
                    week.completed === 0 && 'bg-fill-control',
                  )}
                  style={{ height: `${Math.max(4, (week.completed / max) * 100)}%` }}
                />
              </span>
              <span
                aria-hidden
                className={cn(
                  'w-full truncate text-center text-caption',
                  current ? 'font-semibold text-text' : 'text-text-secondary',
                )}
              >
                {date}
              </span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
