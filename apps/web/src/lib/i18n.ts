import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type Locale } from '@crystal/shared'
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

/** Each language is its own chunk: only the one in use is downloaded. */
const TRANSLATIONS: Record<Locale, () => Promise<Translation>> = {
  en: () => import('../locales/en').then((module) => module.en),
  de: () => import('../locales/de').then((module) => module.de),
}

async function loadTranslation(locale: Locale): Promise<void> {
  if (i18next.hasResourceBundle(locale, 'translation')) return
  i18next.addResourceBundle(locale, 'translation', await TRANSLATIONS[locale]())
}

/** Starts i18n with the given language; resolves once its texts are loaded. */
export async function initI18n(initialLocale: Locale): Promise<void> {
  await i18next.use(initReactI18next).init({
    resources: {},
    lng: initialLocale,
    // Every language has every key (the type checker ensures it), so none is needed.
    fallbackLng: false,
    interpolation: { escapeValue: false }, // React escapes already.
    returnNull: false,
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

/** Translates a message that may be a translation key (from shared Zod schemas). */
export function translateMessage(message: string | undefined): string | undefined {
  if (!message) return undefined
  return message.startsWith('validation.') ? i18next.t(message, { defaultValue: message }) : message
}
