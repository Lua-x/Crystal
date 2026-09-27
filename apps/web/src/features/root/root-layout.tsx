import { useQuery } from '@tanstack/react-query'
import { Link, Outlet, useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { CircleAlert, Compass } from 'lucide-react'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { applyAppearance } from '../../lib/appearance'
import { errorMessage } from '../../lib/errors'
import { setLocale } from '../../lib/i18n'
import { meQuery } from '../../lib/queries'

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

export function RootLayout() {
  return (
    <>
      <AppearanceSync />
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
