import type { List } from '@crystal/shared'
import { CalendarClock, Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { LIST_BG_CLASS } from '../tasks/list-colors'
import { GameCover } from './game-cover'
import { deadlineState, gameProgress, type GameProgress } from './game-logic'

/** Cover, progress and finish-by date above a game's goals. */
export function GameHeader({ list, today }: { list: List; today: string }) {
  const progress = gameProgress(list)
  if (!list.coverImageId && !progress && !list.deadline) return null
  const finished = progress !== null && progress.done === progress.total

  return (
    <div className="mb-6 flex flex-col gap-4">
      {list.coverImageId && (
        <GameCover
          imageId={list.coverImageId}
          className="aspect-[460/215] max-h-56 w-full rounded-2xl shadow-sm"
        />
      )}
      {(progress || list.deadline) && (
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
          {progress && <ProgressBar list={list} progress={progress} />}
          {list.deadline && <Deadline deadline={list.deadline} today={today} finished={finished} />}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ list, progress }: { list: List; progress: GameProgress }) {
  const { t, i18n } = useTranslation()
  const finished = progress.done === progress.total
  const label = finished
    ? t('games.finished')
    : t('games.progress', { done: progress.done, total: progress.total })
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent' }).format(
    progress.percent / 100,
  )
  return (
    <div className="flex min-w-56 flex-1 items-center gap-3">
      <div
        role="progressbar"
        aria-label={t('games.progressLabel')}
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
        aria-valuetext={`${label}, ${percent}`}
        className="h-2 flex-1 overflow-hidden rounded-full bg-fill-control"
      >
        <div
          className={cn(
            'h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none',
            LIST_BG_CLASS[list.color],
          )}
          style={{ width: `${progress.percent}%` }}
        />
      </div>
      <span className="flex shrink-0 items-center gap-1.5 text-footnote text-text-secondary tabular-nums">
        {finished && <Trophy aria-hidden className="size-4 text-accent-text" />}
        {label} · {percent}
      </span>
    </div>
  )
}

function Deadline({
  deadline,
  today,
  finished,
}: {
  deadline: string
  today: string
  finished: boolean
}) {
  const { t, i18n } = useTranslation()
  const state = deadlineState(deadline, today)
  const date = new Intl.DateTimeFormat(i18n.language, {
    day: 'numeric',
    month: 'long',
    ...(deadline.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  }).format(new Date(`${deadline}T12:00:00Z`))
  const when =
    state.kind === 'today'
      ? t('games.deadlineToday')
      : state.kind === 'left'
        ? t('games.daysLeft', { count: state.days })
        : t('games.daysOver', { count: state.days })
  // Once everything is done, the date is just a memory.
  const urgent = !finished && state.kind !== 'left'
  return (
    <p
      className={cn(
        'flex items-center gap-1.5 text-footnote',
        urgent ? 'font-medium text-danger' : 'text-text-secondary',
      )}
    >
      <CalendarClock aria-hidden className="size-4" />
      {t('games.deadline', { date })}
      {!finished && <> · {when}</>}
    </p>
  )
}
