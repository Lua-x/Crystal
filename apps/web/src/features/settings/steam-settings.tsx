import type { SteamProfile } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { Gamepad2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Field } from '../../components/ui/field'
import { GroupedSection } from '../../components/ui/grouped'
import { Input } from '../../components/ui/input'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { errorMessage } from '../../lib/errors'
import { steamStatusQuery, useLinkSteam, useUnlinkSteam } from '../games/steam-data'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'
import { useSettingsBack } from './use-settings-back'

export function SteamSettingsPage() {
  const { t } = useTranslation()
  const me = useMe()
  const status = useQuery(steamStatusQuery)

  return (
    <Page title={t('settings.sections.steam')} backTo={useSettingsBack()} variant="grouped">
      <GroupedSection title={t('settings.steam.title')}>
        <div className="flex flex-col gap-4 p-4">
          <p className="text-callout text-text-secondary">{t('settings.steam.intro')}</p>
          {status.isPending ? (
            <div className="flex justify-center py-4">
              <Spinner className="size-5" label={t('common.loading')} />
            </div>
          ) : status.isError ? (
            <Alert>{errorMessage(status.error)}</Alert>
          ) : !status.data.available ? (
            <Alert tone="info">
              {t('settings.steam.unavailable')}{' '}
              {me.role === 'admin'
                ? t('settings.steam.unavailableAdmin')
                : t('settings.steam.unavailableUser')}
            </Alert>
          ) : status.data.profile ? (
            <LinkedProfile profile={status.data.profile} />
          ) : (
            <LinkForm />
          )}
        </div>
      </GroupedSection>
    </Page>
  )
}

function LinkForm() {
  const { t } = useTranslation()
  const link = useLinkSteam()
  const [profile, setProfile] = useState('')
  const [error, setError] = useState<string | undefined>()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!profile.trim()) {
      setError('validation.required')
      return
    }
    link.mutate(
      { profile: profile.trim() },
      { onError: (failure) => setError(errorMessage(failure)) },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <Field
        label={t('settings.steam.profile')}
        description={t('settings.steam.profileHint')}
        error={error}
      >
        {(props) => (
          <Input
            {...props}
            value={profile}
            placeholder={t('settings.steam.profilePlaceholder')}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => {
              setProfile(event.target.value)
              setError(undefined)
            }}
          />
        )}
      </Field>
      <div>
        <Button type="submit" variant="primary" loading={link.isPending}>
          <Gamepad2 aria-hidden />
          {t('settings.steam.link')}
        </Button>
      </div>
    </form>
  )
}

function LinkedProfile({ profile }: { profile: SteamProfile }) {
  const { t } = useTranslation()
  const unlink = useUnlinkSteam()
  const [confirming, setConfirming] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
        <Gamepad2 aria-hidden className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-callout font-medium">
          {t('settings.steam.linked', { name: profile.name })}
        </p>
        <p className="text-footnote text-text-secondary tabular-nums">
          {t('settings.steam.steamId', { id: profile.steamId })}
        </p>
      </div>
      <Button variant="destructive-plain" onClick={() => setConfirming(true)}>
        {t('settings.steam.unlink')}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t('settings.steam.unlinkTitle')}
        description={t('settings.steam.unlinkBody')}
        confirmLabel={t('settings.steam.unlink')}
        destructive
        onConfirm={() =>
          unlink.mutate(undefined, { onError: (error) => toast.error(errorMessage(error)) })
        }
      />
    </div>
  )
}
