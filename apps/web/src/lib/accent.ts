import { ACCENT_PRESETS, type AccentPreset } from '@crystal/shared'

import { adjustLightness, contrastRatio, hexToOklch } from './color'

/** Base colors of the accent presets. The final tokens are derived per color scheme. */
export const ACCENT_PRESET_COLORS: Record<AccentPreset, string> = {
  blue: '#1f7cf2',
  purple: '#9a55d4',
  pink: '#e0508a',
  red: '#e5484d',
  orange: '#f27d1a',
  yellow: '#f5c518',
  green: '#2fa36b',
  teal: '#14a39a',
  graphite: '#8a8983',
}

/**
 * Every opaque surface accent-colored text can appear on (canvas, window,
 * grouped, cell, elevated). Must match tokens.css – a test keeps them in sync.
 */
export const SURFACES = {
  light: ['#fefefd', '#f3f2ef', '#f5f4f1', '#ffffff', '#ffffff'],
  dark: ['#1c1b19', '#141312', '#161514', '#262523', '#2b2a27'],
} as const
const WHITE = '#ffffff'
/** Dark text on light accents such as yellow. Matches `--color-text` in light mode. */
const INK = '#1d1c1a'
const AA = 4.5

export interface AccentTokens {
  /** Fill for primary buttons, checkmarks and switches. */
  accent: string
  /** Text and icons placed on `accent`. */
  onAccent: string
  /** Accent-colored text and icons on the canvas (links, selected items). */
  accentText: string
}

export function resolveAccentBase(accent: string): string {
  return accent in ACCENT_PRESET_COLORS ? ACCENT_PRESET_COLORS[accent as AccentPreset] : accent
}

/**
 * Derives accessible accent tokens from any base color. Every text pairing
 * reaches WCAG AA (4.5:1): light colors like yellow keep their tone and get dark
 * text; everything else is darkened just enough for white text. Accent text is
 * darkened (light mode) or lightened (dark mode) until it is readable on every surface.
 */
export function computeAccentTokens(base: string, scheme: 'light' | 'dark'): AccentTokens {
  const lightTone = hexToOklch(base).l >= 0.75

  let accent = base
  let onAccent = WHITE
  if (contrastRatio(base, WHITE) < AA) {
    if (lightTone && contrastRatio(base, INK) >= AA) {
      onAccent = INK
    } else {
      accent = adjustLightness(base, 'darker', (candidate) => contrastRatio(candidate, WHITE) >= AA)
    }
  }

  const accentText = adjustLightness(base, scheme === 'light' ? 'darker' : 'lighter', (candidate) =>
    SURFACES[scheme].every((surface) => contrastRatio(candidate, surface) >= AA),
  )

  return { accent, onAccent, accentText }
}

export type AccentCssVariables = Record<
  '--color-accent' | '--color-on-accent' | '--color-accent-text',
  string
>

/** CSS custom properties for an accent, using `light-dark()` for both schemes. */
export function accentCssVariables(accent: string): AccentCssVariables {
  const base = resolveAccentBase(accent)
  const light = computeAccentTokens(base, 'light')
  const dark = computeAccentTokens(base, 'dark')
  return {
    '--color-accent': `light-dark(${light.accent}, ${dark.accent})`,
    '--color-on-accent': `light-dark(${light.onAccent}, ${dark.onAccent})`,
    '--color-accent-text': `light-dark(${light.accentText}, ${dark.accentText})`,
  }
}

export const ACCENT_PRESET_LIST = ACCENT_PRESETS
