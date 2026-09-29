import { describe, expect, it } from 'vitest'

import {
  accentCssVariables,
  ACCENT_PRESET_COLORS,
  computeAccentTokens,
  softAccentOn,
  SURFACES,
} from './accent'
import { contrastRatio, formatHex, hexToOklch, oklchToHex, parseHex } from './color'

describe('color math', () => {
  it('computes WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBe(1)
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2)
  })

  it('round-trips hex colors through OKLCH', () => {
    for (const hex of ['#1f7cf2', '#f5c518', '#000000', '#ffffff', '#8a8983']) {
      expect(oklchToHex(hexToOklch(hex))).toBe(hex)
    }
  })

  it('parses and formats hex colors', () => {
    expect(formatHex(parseHex('#FF9500'))).toBe('#ff9500')
    expect(() => parseHex('#fff')).toThrow()
  })
})

describe('computeAccentTokens', () => {
  const colors = [
    ...Object.values(ACCENT_PRESET_COLORS),
    // Deliberately awkward custom choices.
    '#ffff00',
    '#00ffff',
    '#ffffff',
    '#000000',
    '#7f7f7f',
    '#ff00ff',
  ]

  it.each(colors)('%s is readable in light and dark mode', (color) => {
    for (const scheme of ['light', 'dark'] as const) {
      const tokens = computeAccentTokens(color, scheme)
      expect(
        contrastRatio(tokens.onAccent, tokens.accent),
        `${scheme} on-accent`,
      ).toBeGreaterThanOrEqual(4.5)
      for (const surface of SURFACES[scheme]) {
        expect(
          contrastRatio(tokens.accentText, surface),
          `${scheme} accent text on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5)
        const tinted = softAccentOn(tokens.accent, surface)
        expect(
          contrastRatio(tokens.accentText, tinted),
          `${scheme} accent text on selected ${surface} (${tinted})`,
        ).toBeGreaterThanOrEqual(4.5)
      }
    }
  })

  it('computes the soft accent like the browser composites it', () => {
    expect(softAccentOn('#000000', '#ffffff')).toBe('#dbdbdb')
    expect(softAccentOn('#ffffff', '#ffffff')).toBe('#ffffff')
  })

  it('keeps light accents like yellow and uses dark text on them', () => {
    const tokens = computeAccentTokens(ACCENT_PRESET_COLORS.yellow, 'light')
    expect(tokens.accent).toBe(ACCENT_PRESET_COLORS.yellow)
    expect(tokens.onAccent).toBe('#1d1c1a')
  })

  it('only darkens as much as needed', () => {
    const tokens = computeAccentTokens(ACCENT_PRESET_COLORS.blue, 'light')
    const ratio = contrastRatio(tokens.onAccent, tokens.accent)
    expect(ratio).toBeGreaterThanOrEqual(4.5)
    expect(ratio).toBeLessThan(4.7)
  })

  it('produces light-dark() CSS values for presets and custom colors', () => {
    expect(accentCssVariables('blue')['--color-accent']).toMatch(
      /^light-dark\(#[0-9a-f]{6}, #[0-9a-f]{6}\)$/,
    )
    expect(accentCssVariables('#34c759')['--color-on-accent']).toMatch(/^light-dark\(/)
  })

  it('shades hover states away from the text: darker under white, lighter under dark text', () => {
    expect(accentCssVariables('green')['--color-accent-shade']).toBe('light-dark(black, black)')
    expect(accentCssVariables('yellow')['--color-accent-shade']).toBe('light-dark(white, white)')
  })
})
