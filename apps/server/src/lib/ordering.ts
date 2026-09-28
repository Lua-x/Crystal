import { keyBetween, keysBetween } from '@crystal/shared'

import { AppError } from './errors.js'

export interface Ordered {
  id: string
  position: string
}

/**
 * The position for an item placed directly after `afterId` (or first, for
 * `null`) among `items` – sorted by position and not containing the moved item.
 *
 * Two items can end up with the same key (for example after concurrent moves).
 * Then `rebalance` is called to persist fresh, distinct keys for all items.
 */
export function positionAfter<T extends Ordered>(
  items: T[],
  afterId: string | null,
  rebalance: (items: T[]) => T[],
): string {
  const index = afterId === null ? -1 : items.findIndex((item) => item.id === afterId)
  if (afterId !== null && index === -1) {
    throw new AppError(400, 'validation_failed', 'The item to place after is not in the target.')
  }
  const before = index >= 0 ? items[index]!.position : null
  const after = items[index + 1]?.position ?? null
  if (before !== null && after !== null && before >= after) {
    return positionAfter(rebalance(items), afterId, () => {
      throw new Error('Rebalancing did not produce distinct keys')
    })
  }
  return keyBetween(before, after)
}

export function positionAtStart(items: Ordered[]): string {
  return keyBetween(null, items[0]?.position ?? null)
}

export function positionAtEnd(items: Ordered[]): string {
  return keyBetween(items.at(-1)?.position ?? null, null)
}

/** Fresh, evenly spread keys for `items` in their current order. */
export function freshPositions<T extends Ordered>(items: T[]): T[] {
  const keys = keysBetween(null, null, items.length)
  return items.map((item, index) => ({ ...item, position: keys[index]! }))
}
