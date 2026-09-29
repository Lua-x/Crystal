import type { AccentPreset } from '@crystal/shared'

import { accentCssVariables } from '../../lib/accent'
import { cn } from '../../lib/cn'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** Accent colors with white-on-color contrast in both modes (yellow needs dark text). */
const PALETTE: AccentPreset[] = [
  'blue',
  'purple',
  'pink',
  'red',
  'orange',
  'green',
  'teal',
  'graphite',
]
const cache = new Map<AccentPreset, { background: string; color: string }>()

/** The same person always gets the same color, so people are easy to tell apart. */
function colorsFor(seed: string) {
  let hash = 0
  for (const character of seed) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  const preset = PALETTE[hash % PALETTE.length]!
  let colors = cache.get(preset)
  if (!colors) {
    const variables = accentCssVariables(preset)
    colors = { background: variables['--color-accent'], color: variables['--color-on-accent'] }
    cache.set(preset, colors)
  }
  return colors
}

export function Avatar({
  name,
  seed,
  className,
}: {
  name: string
  /** A stable id (e.g. the user id) that picks the color; without it, the accent color. */
  seed?: string
  className?: string
}) {
  return (
    <span
      aria-hidden
      style={seed ? colorsFor(seed) : undefined}
      className={cn(
        'inline-flex size-7 shrink-0 items-center justify-center rounded-full text-footnote font-semibold select-none',
        !seed && 'bg-accent text-on-accent',
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}
