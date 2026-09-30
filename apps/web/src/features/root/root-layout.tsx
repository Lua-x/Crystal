import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { CircleAlert, Compass } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { applyAppearance } from '../../lib/appearance'
import { useCurrentTitle, useDocumentTitle } from '../../lib/document-title'
import { errorMessage } from '../../lib/errors'
import { setInstanceMode, setLocale } from '../../lib/i18n'
import { rememberMode } from '../../lib/instance-mode'
import { authConfigQuery, meQuery } from '../../lib/queries'

/** Keeps theme, accent color and language in sync with the signed-in user. */
function AppearanceSync() {
  const { data: me } = useQuery(meQuery)
  useEffect(() => {
    if (!me) return
    applyAppearance(me.preferences, me.locale)
    void setLocale(me.locale)
  }, [me])
  return null
}

/** Uses the gaming words on gaming instances, and remembers the mode for the next start. */
function InstanceModeSync() {
  const { data: config } = useQuery(authConfigQuery)
  const mode = config?.mode
  useEffect(() => {
    if (!mode) return
    rememberMode(mode)
    void setInstanceMode(mode)
  }, [mode])
  return null
}

/**
 * Screen readers do not notice that a single-page app shows another page, so
 * the new page's title is announced (not on the first load, which they read anyway).
 */
function PageAnnouncer() {
  const title = useCurrentTitle()
  const [state, setState] = useState({ title, pages: 0, announcement: '' })
  if (title !== state.title) {
    // The first page replaces the placeholder title; later ones are announced.
    setState({ title, pages: state.pages + 1, announcement: state.pages > 0 ? title : '' })
  }
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {state.announcement}
    </div>
  )
}

export function RootLayout() {
  return (
    <>
      <AppearanceSync />
      <InstanceModeSync />
      <PageAnnouncer />
      <Outlet />
    </>
  )
}

export function PendingScreen() {
  const { t } = useTranslation()
  return (
    <div className="flex h-full items-center justify-center text-text-secondary">
      <Spinner className="size-6" label={t('common.loading')} />
    </div>
  )
}

export function ErrorScreen({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation()
  const router = useRouter()
  useDocumentTitle(t('errors.title'))
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <EmptyState
        icon={<CircleAlert />}
        title={t('errors.title')}
        body={errorMessage(error)}
        action={
          <Button
            variant="primary"
            onClick={() => {
              reset()
              void router.invalidate()
            }}
          >
            {t('common.retry')}
          </Button>
        }
      />
    </div>
  )
}

export function NotFoundScreen() {
  const { t } = useTranslation()
  useDocumentTitle(t('notFound.title'))
  return (
    <div className="flex h-full items-center justify-center bg-canvas">
      <EmptyState
        icon={<Compass />}
        title={t('notFound.title')}
        body={t('notFound.body')}
        action={
          <Button asChild variant="primary">
            <Link to="/">{t('notFound.home')}</Link>
          </Button>
        }
      />
    </div>
  )
}
