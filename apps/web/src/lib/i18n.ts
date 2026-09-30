import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type InstanceMode, type Locale } from '@crystal/shared'
// DEFAULT_LOCALE is the answer when the browser prefers no supported language.
import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { z } from 'zod'

import type { Translation } from '../locales/en'

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation'
    resources: { translation: Translation }
  }
}

/** Picks the best supported language from the browser settings. */
export function detectLocale(languages: readonly string[] = navigator.languages): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split('-')[0]
    const match = SUPPORTED_LOCALES.find((locale) => locale === base)
    if (match) return match
  }
  return DEFAULT_LOCALE
}

type DeepPartial<T> = { [Key in keyof T]?: T[Key] extends string ? string : DeepPartial<T[Key]> }

/** Texts that differ in gaming mode; everything else comes from the base language. */
export type TranslationOverlay = DeepPartial<Translation>

/** Each language is its own chunk: only the one in use is downloaded. */
const TRANSLATIONS: Record<Locale, () => Promise<Translation>> = {
  en: () => import('../locales/en').then((module) => module.en),
  de: () => import('../locales/de').then((module) => module.de),
}

/** Gaming words ("game", "goal"), only downloaded on gaming instances. */
const GAMING_TRANSLATIONS: Record<Locale, () => Promise<TranslationOverlay>> = {
  en: () => import('../locales/gaming-en').then((module) => module.enGaming),
  de: () => import('../locales/gaming-de').then((module) => module.deGaming),
}

let activeMode: InstanceMode = 'standard'
/** The mode each loaded language's texts are in. */
const loadedModes = new Map<Locale, InstanceMode>()

async function loadTranslation(locale: Locale): Promise<void> {
  const mode = activeMode
  if (loadedModes.get(locale) === mode) return
  const [base, overlay] = await Promise.all([
    TRANSLATIONS[locale](),
    mode === 'gaming' ? GAMING_TRANSLATIONS[locale]() : undefined,
  ])
  // The mode changed while loading; the load for the new mode takes over.
  if (mode !== activeMode) return
  // The whole bundle is replaced, so no word of the other mode lingers.
  i18next.addResourceBundle(locale, 'translation', applyOverlay(base, overlay), false, true)
  loadedModes.set(locale, mode)
}

/** The base texts with the overlay's replacements; neither is changed. */
export function applyOverlay(
  base: Translation,
  overlay: TranslationOverlay | undefined,
): Translation {
  return overlay ? (merge(base, overlay) as Translation) : base
}

type Texts = { [key: string]: string | Texts }

function merge(base: Texts, overlay: Texts): Texts {
  const merged = { ...base }
  for (const [key, value] of Object.entries(overlay)) {
    const current = merged[key]
    merged[key] =
      typeof value === 'object' && typeof current === 'object' ? merge(current, value) : value
  }
  return merged
}

/** Starts i18n with the given language; resolves once its texts are loaded. */
export async function initI18n(initialLocale: Locale, mode: InstanceMode): Promise<void> {
  activeMode = mode
  await i18next.use(initReactI18next).init({
    resources: {},
    lng: initialLocale,
    // Every language has every key (the type checker ensures it), so none is needed.
    fallbackLng: false,
    interpolation: { escapeValue: false }, // React escapes already.
    returnNull: false,
    // Re-render when texts are replaced, e.g. once the gaming words have loaded.
    react: { bindI18nStore: 'added' },
  })
  await loadTranslation(initialLocale)
  document.documentElement.lang = initialLocale

  // Zod messages in the user's language. Custom messages (translation keys
  // like `validation.username_format`) are translated where they are shown.
  z.config({
    customError: (issue) => {
      const t = i18next.t.bind(i18next)
      switch (issue.code) {
        case 'too_small':
          if (issue.origin === 'string') {
            return Number(issue.minimum) <= 1
              ? t('validation.required')
              : t('validation.min_length', { count: Number(issue.minimum) })
          }
          return undefined
        case 'too_big':
          return issue.origin === 'string'
            ? t('validation.max_length', { count: Number(issue.maximum) })
            : undefined
        case 'invalid_format':
          return issue.format === 'email' ? t('validation.email') : undefined
        case 'invalid_type':
          return issue.input === undefined ? t('validation.required') : undefined
        default:
          return undefined
      }
    },
  })
}

export async function setLocale(locale: Locale) {
  await loadTranslation(locale)
  if (i18next.language !== locale) await i18next.changeLanguage(locale)
  document.documentElement.lang = locale
}

/** Switches the words to the instance's mode (it is only known once the server answered). */
export async function setInstanceMode(mode: InstanceMode) {
  if (mode === activeMode) return
  activeMode = mode
  await loadTranslation(i18next.language as Locale)
}

/** Translates a message that may be a translation key (from shared Zod schemas). */
export function translateMessage(message: string | undefined): string | undefined {
  if (!message) return undefined
  return message.startsWith('validation.') ? i18next.t(message, { defaultValue: message }) : message
}
