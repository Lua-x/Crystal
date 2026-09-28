import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

/*
 * Manual order is stored as fractional index keys: strings that sort correctly
 * and always leave room in between. Moving an item changes only that item.
 */

/** A key that sorts between `before` and `after` (either may be null for the ends). */
export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)
}

/** `count` evenly spread keys between `before` and `after`. */
export function keysBetween(before: string | null, after: string | null, count: number): string[] {
  return generateNKeysBetween(before, after, count)
}

export function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
