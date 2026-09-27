// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { ACCENT_PRESET_COLORS, computeAccentTokens, SURFACES } from '../lib/accent'
import { contrastRatio, formatHex, parseHex } from '../lib/color'

/*
 * Verifies the WCAG 2.1 AA contrast of the design tokens in both color schemes,
 * so that a token change cannot silently break accessibility.
 */

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8')

function token(name: string): { light: string; dark: string } {
  const match = new RegExp(
    `--color-${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`,
    'i',
  ).exec(css)
  if (!match) throw new Error(`Token --color-${name} is not a light-dark() pair of hex colors`)
  return { light: match[1]!, dark: match[2]! }
}

type Scheme = 'light' | 'dark'
const SCHEMES: Scheme[] = ['light', 'dark']

/** Composites `color` at `alpha` over `background` (how the soft fills render). */
function blend(color: string, alpha: number, background: string): string {
  const fg = parseHex(color)
  const bg = parseHex(background)
  return formatHex(
    [0, 1, 2].map((i) => fg[i]! * alpha + bg[i]! * (1 - alpha)) as [number, number, number],
  )
}

describe('design tokens', () => {
  const backgrounds = ['canvas', 'cell', 'elevated'] as const

  it.each(SCHEMES)('%s: body text colors reach 4.5:1 on all surfaces', (scheme) => {
    for (const text of ['text', 'text-secondary', 'danger', 'success', 'warning']) {
      for (const background of [...backgrounds, 'grouped', 'window']) {
        const ratio = contrastRatio(token(text)[scheme], token(background)[scheme])
        expect(ratio, `${text} on ${background}`).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it.each(SCHEMES)('%s: placeholder text reaches 4.5:1 inside inputs', (scheme) => {
    for (const background of backgrounds) {
      const ratio = contrastRatio(token('text-tertiary')[scheme], token(background)[scheme])
      expect(ratio, `text-tertiary on ${background}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it.each(SCHEMES)('%s: control borders reach 3:1 (non-text contrast)', (scheme) => {
    for (const background of [...backgrounds, 'grouped']) {
      const ratio = contrastRatio(token('border-control')[scheme], token(background)[scheme])
      expect(ratio, `border-control on ${background}`).toBeGreaterThanOrEqual(3)
    }
  })

  it.each(SCHEMES)('%s: text on destructive buttons reaches 4.5:1', (scheme) => {
    expect(
      contrastRatio(token('on-danger')[scheme], token('danger-fill')[scheme]),
    ).toBeGreaterThanOrEqual(4.5)
  })

  it.each(SCHEMES)('%s: badge labels stay readable on their tinted backgrounds', (scheme) => {
    const cell = token('cell')[scheme]
    const text = token('text')[scheme]
    const tints: [string, string, number][] = [
      ['danger', token('danger')[scheme], 0.12],
      ['success', token('success')[scheme], 0.12],
      ['warning', token('warning')[scheme], 0.14],
      ['accent', computeAccentTokens(ACCENT_PRESET_COLORS.blue, scheme).accent, 0.14],
    ]
    for (const [name, color, alpha] of tints) {
      const background = blend(color, alpha, cell)
      expect(contrastRatio(text, background), `${name} badge`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('keeps the surfaces used for accent calculations in sync', () => {
    const names = ['canvas', 'window', 'grouped', 'cell', 'elevated']
    expect(names.map((name) => token(name).light)).toEqual(SURFACES.light)
    expect(names.map((name) => token(name).dark)).toEqual(SURFACES.dark)
  })

  it('uses the computed blue accent as the default', () => {
    const light = computeAccentTokens(ACCENT_PRESET_COLORS.blue, 'light')
    const dark = computeAccentTokens(ACCENT_PRESET_COLORS.blue, 'dark')
    expect(token('accent')).toEqual({ light: light.accent, dark: dark.accent })
    expect(token('on-accent')).toEqual({ light: light.onAccent, dark: dark.onAccent })
    expect(token('accent-text')).toEqual({ light: light.accentText, dark: dark.accentText })
  })
})
