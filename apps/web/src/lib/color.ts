/*
 * Minimal color math for the accent color system: sRGB <-> OKLCH conversion
 * (Björn Ottosson's OKLab) and WCAG 2.x contrast ratios.
 */

export interface Oklch {
  l: number
  c: number
  h: number
}

type Rgb = [number, number, number]

const toLinear = (channel: number) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
const fromLinear = (channel: number) =>
  channel <= 0.0031308 ? channel * 12.92 : 1.055 * channel ** (1 / 2.4) - 0.055

export function parseHex(hex: string): Rgb {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) throw new Error(`Invalid hex color: ${hex}`)
  const value = Number.parseInt(match[1]!, 16)
  return [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff].map((c) => c / 255) as Rgb
}

export function formatHex([r, g, b]: Rgb): string {
  return `#${[r, g, b]
    .map((channel) =>
      Math.round(Math.min(1, Math.max(0, channel)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`
}

function linearToOklch([r, g, b]: Rgb): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { l: L, c: Math.hypot(a, bb), h: Math.atan2(bb, a) }
}

function oklchToLinear({ l: L, c, h }: Oklch): Rgb {
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

export function hexToOklch(hex: string): Oklch {
  return linearToOklch(parseHex(hex).map(toLinear) as Rgb)
}

const inGamut = (rgb: Rgb) => rgb.every((channel) => channel >= -1e-4 && channel <= 1 + 1e-4)

/** Converts to hex, reducing chroma until the color fits into sRGB. */
export function oklchToHex(color: Oklch): string {
  let linear = oklchToLinear(color)
  if (!inGamut(linear)) {
    let low = 0
    let high = color.c
    for (let i = 0; i < 24; i++) {
      const mid = (low + high) / 2
      if (inGamut(oklchToLinear({ ...color, c: mid }))) low = mid
      else high = mid
    }
    linear = oklchToLinear({ ...color, c: low })
  }
  return formatHex(linear.map(fromLinear) as Rgb)
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map(toLinear) as Rgb
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG 2.x contrast ratio between two opaque colors (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Moves the OKLCH lightness of `hex` as little as possible in `direction` until
 * `accept` is satisfied. Hue and (where possible) chroma are preserved.
 */
export function adjustLightness(
  hex: string,
  direction: 'darker' | 'lighter',
  accept: (candidate: string) => boolean,
): string {
  if (accept(hex)) return hex
  const base = hexToOklch(hex)
  let near = base.l
  let far = direction === 'darker' ? 0 : 1
  if (!accept(oklchToHex({ ...base, l: far }))) return oklchToHex({ ...base, l: far })
  for (let i = 0; i < 32; i++) {
    const mid = (near + far) / 2
    if (accept(oklchToHex({ ...base, l: mid }))) far = mid
    else near = mid
  }
  return oklchToHex({ ...base, l: far })
}
