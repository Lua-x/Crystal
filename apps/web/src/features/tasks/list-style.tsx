import type { List } from '@crystal/shared'

import { cn } from '../../lib/cn'
import { GameCover } from '../games/game-cover'
import { LIST_BG_CLASS } from './list-colors'

/**
 * The list's cover (games), its emoji, or a dot in the list color. Decorative:
 * the name is always shown.
 */
export function ListIcon({
  list,
  className,
}: {
  list: Pick<List, 'icon' | 'color'> & Partial<Pick<List, 'coverImageId'>>
  className?: string
}) {
  if (list.coverImageId) {
    return (
      <span
        aria-hidden
        className={cn('inline-flex size-5 shrink-0 items-center justify-center', className)}
      >
        <GameCover imageId={list.coverImageId} className="size-5 rounded-[5px]" />
      </span>
    )
  }
  if (list.icon) {
    return (
      <span
        aria-hidden
        className={cn(
          'inline-flex size-5 shrink-0 items-center justify-center text-body leading-none',
          className,
        )}
      >
        {list.icon}
      </span>
    )
  }
  return (
    <span
      aria-hidden
      className={cn('inline-flex size-5 shrink-0 items-center justify-center', className)}
    >
      <span className={cn('size-2.5 rounded-full', LIST_BG_CLASS[list.color])} />
    </span>
  )
}
