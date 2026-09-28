import {
  displayNameSchema,
  emailSchema,
  PASSWORD_MAX_LENGTH,
  passwordSchema,
  SUPPORTED_LOCALES,
  usernameSchema,
  type Locale,
  type Me,
} from '@crystal/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, useNavigate } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'
import { useEffect, useId, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Button } from '../../components/ui/button'
import { Field } from '../../components/ui/field'
import { GroupedRow, GroupedSection } from '../../components/ui/grouped'
import { Input, PasswordInput } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { Switch } from '../../components/ui/switch'
import { toast } from '../../components/ui/toast-store'
import { ApiError, fieldErrors } from '../../lib/api'
import { errorCodeMessage, errorMessage } from '../../lib/errors'
import { deviceTimeZone } from '../../lib/format'
import { setLocale } from '../../lib/i18n'
import { authConfigQuery, useChangePassword, useUnlinkSso, useUpdateMe } from '../../lib/queries'
import { SsoButton } from '../auth/sso-button'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'
import { useSettingsBack } from './use-settings-back'

const LANGUAGE_NAMES: Record<Locale, string> = { de: 'Deutsch', en: 'English' }
const route = getRouteApi('/_app/settings/account')

export function AccountSettingsPage() {
  const { t } = useTranslation()
  const me = useMe()
  const { data: config } = useQuery(authConfigQuery)
  const search = route.useSearch()
  const navigate = useNavigate()

  // Results of the SSO linking round trip arrive as query parameters.
  useEffect(() => {
    if (!search.sso && !search.error) return
    if (search.sso === 'linked') toast.success(t('settings.account.ssoLinkedToast'))
    const message = errorCodeMessage(search.error)
    if (message) toast.error(message)
    void navigate({ to: '/settings/account', search: {}, replace: true })
  }, [search.sso, search.error, navigate, t])

  return (
    <Page title={t('settings.sections.account')} backTo={useSettingsBack()} variant="grouped">
      <div className="flex flex-col gap-8">
        <ProfileSection me={me} />
        <RegionSection me={me} />
        <QuickEntrySection me={me} />
        <PasswordSection me={me} />
        {config?.oidc.enabled && <SsoSection me={me} provider={config.oidc.buttonLabel} />}
      </div>
    </Page>
  )
}

function QuickEntrySection({ me }: { me: Me }) {
  const { t } = useTranslation()
  const update = useUpdateMe()
  const switchId = useId()
  const hintId = useId()
  return (
    <GroupedSection title={t('settings.account.quickEntry')}>
      <GroupedRow
        label={<label htmlFor={switchId}>{t('settings.account.smartEntry')}</label>}
        description={<span id={hintId}>{t('settings.account.smartEntryHint')}</span>}
      >
        <Switch
          id={switchId}
          aria-describedby={hintId}
          checked={me.preferences.smartEntry}
          onCheckedChange={(smartEntry) =>
            update.mutate(
              { preferences: { smartEntry } },
              { onError: (error) => toast.error(errorMessage(error)) },
            )
          }
        />
      </GroupedRow>
    </GroupedSection>
  )
}

const profileSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  email: z.union([z.literal(''), emailSchema]),
})

function ProfileSection({ me }: { me: Me }) {
  const { t } = useTranslation()
  const update = useUpdateMe()
  const form = useForm<z.input<typeof profileSchema>, unknown, z.output<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: { displayName: me.displayName, username: me.username, email: me.email ?? '' },
  })
  const { errors, isDirty, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const updated = await update.mutateAsync({
        displayName: values.displayName,
        username: values.username,
        email: values.email || null,
      })
      form.reset({
        displayName: updated.displayName,
        username: updated.username,
        email: updated.email ?? '',
      })
      toast.success(t('common.saved'))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'username_taken') {
        form.setError('username', { message: errorMessage(error) })
      } else if (error instanceof ApiError && error.code === 'email_taken') {
        form.setError('email', { message: errorMessage(error) })
      } else {
        const byField = fieldErrors(error)
        if (Object.keys(byField).length === 0) toast.error(errorMessage(error))
        for (const field of ['displayName', 'username', 'email'] as const) {
          if (byField[field]) form.setError(field, { message: byField[field] })
        }
      }
    }
  })

  return (
    <GroupedSection title={t('settings.account.profile')}>
      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="flex flex-col gap-4 p-4"
      >
        <Field label={t('auth.displayName')} error={errors.displayName?.message}>
          {(props) => <Input {...props} {...form.register('displayName')} autoComplete="name" />}
        </Field>
        <Field
          label={t('auth.username')}
          description={t('auth.usernameHint')}
          error={errors.username?.message}
        >
          {(props) => (
            <Input
              {...props}
              {...form.register('username')}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
            />
          )}
        </Field>
        <Field
          label={t('auth.email')}
          description={t('auth.emailHint')}
          error={errors.email?.message}
          optional
        >
          {(props) => (
            <Input {...props} {...form.register('email')} type="email" autoComplete="email" />
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" disabled={!isDirty} loading={isSubmitting}>
            {t('common.save')}
          </Button>
        </div>
      </form>
    </GroupedSection>
  )
}

function RegionSection({ me }: { me: Me }) {
  const { t } = useTranslation()
  const update = useUpdateMe()
  const deviceZone = deviceTimeZone()
  const timeZones = useMemo(() => {
    const zones = Intl.supportedValuesOf('timeZone')
    return zones.includes(me.timezone) ? zones : [me.timezone, ...zones]
  }, [me.timezone])

  const save = (input: { locale?: Locale; timezone?: string }) => {
    update.mutate(input, {
      onSuccess: () => toast.success(t('common.saved')),
      onError: (error) => toast.error(errorMessage(error)),
    })
  }

  return (
    <GroupedSection
      title={t('settings.account.region')}
      footer={
        me.timezone !== deviceZone ? (
          <>
            {t('settings.account.timezoneDetected', { zone: deviceZone })}{' '}
            <button
              type="button"
              className="cursor-default font-medium text-accent-text hover:underline"
              onClick={() => save({ timezone: deviceZone })}
            >
              {t('settings.account.timezoneUseDetected', { zone: deviceZone })}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <Field label={t('settings.account.language')}>
          {(props) => (
            <Select
              {...props}
              value={me.locale}
              onChange={(event) => {
                const locale = event.target.value as Locale
                void setLocale(locale)
                save({ locale })
              }}
            >
              {SUPPORTED_LOCALES.map((locale) => (
                <option key={locale} value={locale}>
                  {LANGUAGE_NAMES[locale]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('settings.account.timezone')}>
          {(props) => (
            <Select
              {...props}
              value={me.timezone}
              onChange={(event) => save({ timezone: event.target.value })}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone.replaceAll('_', ' ')}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </GroupedSection>
  )
}

function PasswordSection({ me }: { me: Me }) {
  const { t } = useTranslation()
  const changePassword = useChangePassword()
  const schema = useMemo(
    () =>
      z.object({
        currentPassword: me.hasPassword
          ? z.string().min(1).max(PASSWORD_MAX_LENGTH)
          : z.string().max(PASSWORD_MAX_LENGTH),
        newPassword: passwordSchema,
      }),
    [me.hasPassword],
  )
  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await changePassword.mutateAsync({
        newPassword: values.newPassword,
        ...(me.hasPassword ? { currentPassword: values.currentPassword } : {}),
      })
      form.reset()
      toast.success(t('settings.account.passwordChanged'))
    } catch (error) {
      if (error instanceof ApiError && error.code === 'wrong_password') {
        form.setError('currentPassword', { message: errorMessage(error) }, { shouldFocus: true })
      } else {
        toast.error(errorMessage(error))
      }
    }
  })

  return (
    <GroupedSection
      title={t('settings.account.password')}
      footer={me.hasPassword ? undefined : t('settings.account.setPasswordHint')}
    >
      <form
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        className="flex flex-col gap-4 p-4"
      >
        {/* Lets password managers associate the new password with the account. */}
        <input
          type="text"
          name="username"
          value={me.username}
          autoComplete="username"
          readOnly
          hidden
        />
        {me.hasPassword && (
          <Field
            label={t('settings.account.currentPassword')}
            error={errors.currentPassword?.message}
          >
            {(props) => (
              <PasswordInput
                {...props}
                {...form.register('currentPassword')}
                autoComplete="current-password"
              />
            )}
          </Field>
        )}
        <Field
          label={t('settings.account.newPassword')}
          description={t('auth.passwordHint')}
          error={errors.newPassword?.message}
        >
          {(props) => (
            <PasswordInput
              {...props}
              {...form.register('newPassword')}
              autoComplete="new-password"
            />
          )}
        </Field>
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {me.hasPassword
              ? t('settings.account.changePassword')
              : t('settings.account.setPassword')}
          </Button>
        </div>
      </form>
    </GroupedSection>
  )
}

function SsoSection({ me, provider }: { me: Me; provider: string }) {
  const { t } = useTranslation()
  const unlink = useUnlinkSso()
  const identity = me.identities[0]

  return (
    <GroupedSection
      title={t('settings.account.sso')}
      footer={identity && !me.hasPassword ? t('errors.identity_required') : undefined}
    >
      {identity ? (
        <GroupedRow
          icon={<KeyRound />}
          label={
            identity.email
              ? t('settings.account.ssoLinkedAs', { provider, email: identity.email })
              : t('settings.account.ssoLinked', { provider })
          }
        >
          <Button
            variant="destructive-plain"
            size="sm"
            disabled={!me.hasPassword}
            loading={unlink.isPending}
            onClick={() =>
              unlink.mutate(undefined, {
                onSuccess: () => toast.success(t('settings.account.ssoUnlinkedToast')),
                onError: (error) => toast.error(errorMessage(error)),
              })
            }
          >
            {t('settings.account.ssoUnlink')}
          </Button>
        </GroupedRow>
      ) : (
        <div className="flex flex-col gap-3 p-4">
          <p className="text-callout text-text-secondary">
            {t('settings.account.ssoNotLinked', { provider })}
          </p>
          <SsoButton provider={provider} intent="link" />
        </div>
      )}
    </GroupedSection>
  )
}
