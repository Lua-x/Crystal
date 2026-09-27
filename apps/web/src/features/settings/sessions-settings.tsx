import type { SessionInfo } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { Laptop, Smartphone, Tablet } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { GroupedRow, GroupedSection } from '../../components/ui/grouped'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { errorMessage } from '../../lib/errors'
import { describeUserAgent, formatRelative } from '../../lib/format'
import { sessionsQuery, useRevokeOtherSessions, useRevokeSession } from '../../lib/queries'
import { Page } from '../shell/page'
import { useSettingsBack } from './use-settings-back'

export function SessionsSettingsPage() {
  const { t } = useTranslation()
  const sessions = useQuery(sessionsQuery)
  const revokeOthers = useRevokeOtherSessions()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const others = sessions.data?.filter((session) => !session.current).length ?? 0

  return (
    <Page title={t('settings.sections.sessions')} backTo={useSettingsBack()} variant="grouped">
      {sessions.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" label={t('common.loading')} />
        </div>
      ) : sessions.isError ? (
        <Alert>{errorMessage(sessions.error)}</Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <GroupedSection title={t('settings.sessions.title')} footer={t('settings.sessions.hint')}>
            {sessions.data.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </GroupedSection>
          {others > 0 && (
            <div>
              <Button variant="destructive-plain" onClick={() => setConfirmOpen(true)}>
                {t('settings.sessions.signOutOthers')}
              </Button>
            </div>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('settings.sessions.signOutOthers')}
        description={t('settings.sessions.hint')}
        confirmLabel={t('common.signOut')}
        destructive
        onConfirm={async () => {
          try {
            await revokeOthers.mutateAsync()
            toast.success(t('settings.sessions.signedOutOthers'))
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        }}
      />
    </Page>
  )
}

function SessionRow({ session }: { session: SessionInfo }) {
  const { t, i18n } = useTranslation()
  const revoke = useRevokeSession()
  const device = describeUserAgent(session.userAgent)
  const Icon = device.kind === 'phone' ? Smartphone : device.kind === 'tablet' ? Tablet : Laptop
  const name =
    device.browser && device.os
      ? t('settings.sessions.deviceOn', { browser: device.browser, os: device.os })
      : (device.browser ?? device.os ?? t('settings.sessions.unknownDevice'))
  const details = [
    t('settings.sessions.lastActive', { time: formatRelative(session.lastSeenAt, i18n.language) }),
    session.ipAddress,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <GroupedRow
      icon={<Icon />}
      label={
        <span className="flex flex-wrap items-center gap-2">
          {name}
          {session.current && <Badge tone="accent">{t('settings.sessions.thisDevice')}</Badge>}
        </span>
      }
      description={details}
    >
      {!session.current && (
        <Button
          variant="destructive-plain"
          size="sm"
          loading={revoke.isPending}
          onClick={() =>
            revoke.mutate(session.id, {
              onSuccess: () => toast.success(t('settings.sessions.signedOut')),
              onError: (error) => toast.error(errorMessage(error)),
            })
          }
        >
          {t('settings.sessions.signOut')}
        </Button>
      )}
    </GroupedRow>
  )
}
