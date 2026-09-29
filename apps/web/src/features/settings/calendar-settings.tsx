import type { CalendarFeed } from '@crystal/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Check, Copy, ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { GroupedSection } from '../../components/ui/grouped'
import { Input } from '../../components/ui/input'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatRelative } from '../../lib/format'
import { Page } from '../shell/page'
import { useSettingsBack } from './use-settings-back'

const feedKey = ['me', 'calendar'] as const
const feedQuery = queryOptions({
  queryKey: feedKey,
  queryFn: () => api<CalendarFeed | null>('/me/calendar'),
})

function useCreateFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<CalendarFeed>('/me/calendar', { method: 'POST' }),
    onSuccess: (feed) => queryClient.setQueryData(feedKey, feed),
  })
}

function useDeleteFeed() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api<void>('/me/calendar', { method: 'DELETE' }),
    onSuccess: () => queryClient.setQueryData(feedKey, null),
  })
}

export function CalendarSettingsPage() {
  const { t } = useTranslation()
  const feed = useQuery(feedQuery)
  const create = useCreateFeed()

  return (
    <Page title={t('settings.sections.calendar')} backTo={useSettingsBack()} variant="grouped">
      <GroupedSection title={t('settings.calendar.title')} footer={t('settings.calendar.private')}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-callout text-text-secondary">{t('settings.calendar.intro')}</p>
          {feed.isPending ? (
            <div className="flex justify-center py-4">
              <Spinner className="size-5" label={t('common.loading')} />
            </div>
          ) : feed.isError ? (
            <Alert>{errorMessage(feed.error)}</Alert>
          ) : feed.data ? (
            <FeedDetails feed={feed.data} />
          ) : (
            <div>
              <Button
                variant="primary"
                loading={create.isPending}
                onClick={() =>
                  create.mutate(undefined, {
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <CalendarDays aria-hidden />
                {t('settings.calendar.create')}
              </Button>
            </div>
          )}
        </div>
      </GroupedSection>
    </Page>
  )
}

function FeedDetails({ feed }: { feed: CalendarFeed }) {
  const { t, i18n } = useTranslation()
  const create = useCreateFeed()
  const remove = useDeleteFeed()
  const [copied, setCopied] = useState(false)
  const [confirm, setConfirm] = useState<'replace' | 'turnOff' | null>(null)
  const url = `${window.location.origin}${feed.path}`
  const webcal = `webcal://${window.location.host}${feed.path}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('errors.unexpected'))
    }
  }

  const meta = [
    t('settings.calendar.created', { date: formatDate(feed.createdAt, i18n.language) }),
    feed.lastUsedAt
      ? t('settings.calendar.lastUsed', { time: formatRelative(feed.lastUsedAt, i18n.language) })
      : t('settings.calendar.neverUsed'),
  ].join(' · ')

  return (
    <>
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          aria-label={t('settings.calendar.link')}
          onFocus={(event) => event.target.select()}
          className="font-mono text-subhead"
          data-testid="calendar-link"
        />
        <Button variant="secondary" onClick={() => void copy()} className="h-9 pointer-coarse:h-11">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      <p className="text-footnote text-text-secondary">{meta}</p>
      <a
        href={webcal}
        className="inline-flex w-fit items-center gap-1.5 text-callout font-medium text-accent-text hover:underline"
      >
        {t('settings.calendar.open')}
        <ExternalLink aria-hidden className="size-4" />
      </a>
      <p className="text-footnote text-text-secondary">{t('settings.calendar.google')}</p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => setConfirm('replace')}>{t('settings.calendar.replace')}</Button>
        <Button variant="destructive-plain" onClick={() => setConfirm('turnOff')}>
          {t('settings.calendar.turnOff')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm === 'replace'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('settings.calendar.replaceTitle')}
        description={t('settings.calendar.replaceBody')}
        confirmLabel={t('settings.calendar.replaceConfirm')}
        onConfirm={async () => {
          try {
            await create.mutateAsync()
            toast.success(t('settings.calendar.replaced'))
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        }}
      />
      <ConfirmDialog
        open={confirm === 'turnOff'}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={t('settings.calendar.turnOffTitle')}
        description={t('settings.calendar.turnOffBody')}
        confirmLabel={t('settings.calendar.turnOffConfirm')}
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync()
            toast.success(t('settings.calendar.turnedOff'))
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        }}
      />
    </>
  )
}
