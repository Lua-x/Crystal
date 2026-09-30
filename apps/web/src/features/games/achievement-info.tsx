import type { Task } from '@crystal/shared'
import { Trophy } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { GameCover } from './game-cover'
import { formatRarity } from './game-logic'

/** For goals imported from Steam: the achievement's icon, how rare it is, and secrets. */
export function AchievementInfo({ task }: { task: Task }) {
  const { t, i18n } = useTranslation()
  const { achievement } = task
  if (!achievement) return null
  const completed = task.completedAt !== null
  const percent =
    achievement.percent === null ? null : formatRarity(achievement.percent, i18n.language)

  return (
    <div className="mt-3 flex items-center gap-3 rounded-xl bg-cell px-3 py-2.5 shadow-sm">
      {achievement.iconImageId ? (
        <GameCover
          imageId={achievement.iconImageId}
          className={cn('size-11 shrink-0 rounded-lg', !completed && 'opacity-70 grayscale')}
        />
      ) : (
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-fill-control text-text-secondary">
          <Trophy aria-hidden className="size-5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-subhead font-medium">{t('games.achievement')}</p>
        {percent && (
          <p className="text-footnote text-text-secondary">{t('games.rarityLabel', { percent })}</p>
        )}
        {achievement.hidden && !task.notes.trim() && (
          <p className="text-footnote text-text-secondary">
            {t('games.hidden')} – {t('games.hiddenBody')}
          </p>
        )}
      </div>
    </div>
  )
}
