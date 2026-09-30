import { describe, expect, it } from 'vitest'

import { applyOverlay } from '../lib/i18n'
import { de } from './de'
import { en } from './en'
import { deGaming } from './gaming-de'
import { enGaming } from './gaming-en'

type Texts = { [key: string]: string | Texts }

/** Every key path in a (partial) set of texts, e.g. `views.empty.list`. */
function paths(texts: Texts, prefix = ''): string[] {
  return Object.entries(texts).flatMap(([key, value]) =>
    typeof value === 'string' ? [prefix + key] : paths(value, `${prefix}${key}.`),
  )
}

/** The `{{placeholders}}` a text uses. */
function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]!).sort()
}

function lookup(texts: Texts, path: string): string {
  let value: string | Texts = texts
  for (const key of path.split('.')) value = (value as Texts)[key]!
  return value as string
}

describe('gaming words', () => {
  it('replace the same texts in every language', () => {
    expect(paths(deGaming as Texts).sort()).toEqual(paths(enGaming as Texts).sort())
  })

  it('keep the placeholders of the texts they replace', () => {
    for (const [base, overlay] of [
      [en, enGaming],
      [de, deGaming],
    ] as const) {
      for (const path of paths(overlay)) {
        expect(placeholders(lookup(overlay as Texts, path)), path).toEqual(
          placeholders(lookup(base as unknown as Texts, path)),
        )
      }
    }
  })

  it('only change what differs and leave the rest', () => {
    const merged = applyOverlay(en, enGaming)
    expect(merged.lists.newList).toBe('Add game')
    expect(merged.views.empty.list).toBe('No goals yet')
    // Untouched neighbours stay, at every depth.
    expect(merged.lists.newGroup).toBe(en.lists.newGroup)
    expect(merged.views.empty.completed).toBe(en.views.empty.completed)
    expect(merged.tasks.menu.open).toBe(en.tasks.menu.open)
    // The base texts themselves are not changed.
    expect(en.lists.newList).toBe('New list')
  })
})
