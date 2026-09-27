import type { Locale, Preferences } from '@crystal/shared'

import { accentCssVariables } from './accent'

const STORAGE_KEY = 'crystal.appearance'

interface CachedAppearance {
  theme: Preferences['theme']
  accent: Record<string, string>
  locale: Locale
}

/**
 * Applies theme and accent color to the document and caches them, so
 * `public/theme-init.js` can restore them before the first paint next time.
 */
export function applyAppearance(preferences: Preferences, locale: Locale): void {
  const root = document.documentElement
  if (preferences.theme === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', preferences.theme)

  const accent = accentCssVariables(preferences.accentColor)
  for (const [name, value] of Object.entries(accent)) root.style.setProperty(name, value)

  const cached: CachedAppearance = { theme: preferences.theme, accent: { ...accent }, locale }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cached))
  } catch {
    // Storage may be unavailable (private mode); the app still works.
  }
}

/** Remembers a language picked on the sign-in screen (before an account exists). */
export function rememberLocale(locale: Locale): void {
  try {
    const cached = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<CachedAppearance> | null
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...cached, locale }))
  } catch {
    // Not critical.
  }
}

/** The locale remembered from the last session, used before anyone signs in. */
export function cachedLocale(): Locale | undefined {
  try {
    const cached = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? 'null',
    ) as Partial<CachedAppearance> | null
    return cached?.locale === 'de' || cached?.locale === 'en' ? cached.locale : undefined
  } catch {
    return undefined
  }
}
