import { defaultFilter } from 'cmdk'
import type { ReactNode } from 'react'

export interface PaletteEntry {
  /** Unique; identifies the entry for cmdk's selection. */
  value: string
  label: string
  hint?: string | undefined
  icon: ReactNode
  /**
   * `match`: shown when the label matches the search. `found`: tasks the
   * server already matched. `last`: always offered while typing, after
   * everything else ("add" and "search" for the typed text).
   */
  rank?: 'match' | 'found' | 'last'
  onSelect: () => void
}

export interface PaletteSection {
  heading: string
  entries: PaletteEntry[]
}

function score(entry: PaletteEntry, search: string): number {
  if (entry.rank === 'found') return 0.02
  if (entry.rank === 'last') return 0.01
  return search ? defaultFilter(entry.label, search) : 1
}

/**
 * Filters and orders the entries: best sections first, best entries first
 * within them, the original order on ties. Done here rather than by cmdk, so
 * the order – and the entry Enter picks – is settled in the same render as
 * the search.
 */
export function rankSections(sections: PaletteSection[], search: string): PaletteSection[] {
  return sections
    .map((section, index) => {
      const entries = section.entries
        .map((entry, position) => ({ entry, position, score: score(entry, search) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score || a.position - b.position)
      return { section, index, entries, best: entries[0]?.score ?? 0 }
    })
    .filter((item) => item.entries.length > 0)
    .sort((a, b) => b.best - a.best || a.index - b.index)
    .map((item) => ({ ...item.section, entries: item.entries.map((entry) => entry.entry) }))
}
