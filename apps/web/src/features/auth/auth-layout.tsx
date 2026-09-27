import { SUPPORTED_LOCALES, type Locale } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { Outlet } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Logo } from '../../components/brand/logo'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { rememberLocale } from '../../lib/appearance'
import { setLocale } from '../../lib/i18n'
import { authConfigQuery } from '../../lib/queries'

const LANGUAGE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English' }

/** Centered card for sign-in, setup and registration. */
export function AuthLayout() {
  const { t, i18n } = useTranslation()
  const { data: config } = useQuery(authConfigQuery)

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4 py-10">
      <main className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo className="size-14" />
        </div>
        <div className="rounded-3xl bg-canvas p-6 shadow-md sm:p-8">
          <Outlet />
        </div>
      </main>
      <footer className="mt-8 flex flex-col items-center gap-3 text-footnote text-text-secondary">
        <SegmentedControl
          aria-label="Language / Sprache"
          value={i18n.language as Locale}
          onValueChange={(locale) => {
            rememberLocale(locale)
            void setLocale(locale)
          }}
          options={SUPPORTED_LOCALES.map((locale) => ({
            value: locale,
            label: LANGUAGE_NAMES[locale],
          }))}
        />
        <span>
          {t('common.appName')}
          {config?.version && config.version !== 'dev' ? ` ${config.version}` : ''}
        </span>
      </footer>
    </div>
  )
}

export function AuthHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-6 text-center">
      <h1 className="text-title2 font-bold">{title}</h1>
      {subtitle && <p className="mt-1.5 text-callout text-text-secondary">{subtitle}</p>}
    </div>
  )
}
