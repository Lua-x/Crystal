import { describe, expect, it } from 'vitest'

import { rankSections, type PaletteEntry, type PaletteSection } from './palette-ranking'

const entry = (label: string, rank?: PaletteEntry['rank']): PaletteEntry => ({
  value: label,
  label,
  icon: null,
  onSelect: () => undefined,
  ...(rank ? { rank } : {}),
})

const sections: PaletteSection[] = [
  { heading: 'Go to', entries: [entry('My Day'), entry('Important'), entry('Settings')] },
  { heading: 'Lists', entries: [entry('Tasks'), entry('Groceries'), entry('Garden')] },
  { heading: 'Found', entries: [entry('Buy groceries', 'found')] },
  { heading: 'Typed', entries: [entry('Add task “groc”', 'last'), entry('Search', 'last')] },
]

const order = (search: string) =>
  rankSections(sections, search).map((section) => [
    section.heading,
    section.entries.map((item) => item.label),
  ])

describe('rankSections', () => {
  it('keeps everything in order without a search', () => {
    expect(rankSections(sections, '').map((section) => section.heading)).toEqual([
      'Go to',
      'Lists',
      'Found',
      'Typed',
    ])
  })

  it('puts real matches first and the typed-text actions last', () => {
    expect(order('groc')).toEqual([
      ['Lists', ['Groceries']],
      ['Found', ['Buy groceries']],
      ['Typed', ['Add task “groc”', 'Search']],
    ])
  })

  it('orders entries within a section by how well they match', () => {
    const shops = [{ heading: 'Lists', entries: [entry('Holiday shop'), entry('Shopping')] }]
    expect(rankSections(shops, 'shop')[0]!.entries.map((item) => item.label)).toEqual([
      'Shopping',
      'Holiday shop',
    ])
  })

  it('still offers the typed-text actions when nothing else matches', () => {
    expect(order('xyz')).toEqual([
      ['Found', ['Buy groceries']],
      ['Typed', ['Add task “groc”', 'Search']],
    ])
  })
})
