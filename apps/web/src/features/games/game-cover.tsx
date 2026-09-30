import { useState } from 'react'

import { cn } from '../../lib/cn'
import { imageUrl } from './game-logic'

/**
 * A game's cover picture. Decorative: the game's name is always shown next to
 * it. When it cannot be loaded (e.g. offline), the space it takes stays empty.
 */
export function GameCover({ imageId, className }: { imageId: string; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === imageId) return <span aria-hidden className={cn('bg-fill-control', className)} />
  return (
    <img
      src={imageUrl(imageId)}
      alt=""
      decoding="async"
      draggable={false}
      onError={() => setFailed(imageId)}
      className={cn('bg-fill-control object-cover', className)}
    />
  )
}
