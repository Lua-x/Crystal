import type { TFunction } from 'i18next'
import {
  NOTIFICATION_CHANNEL_TYPES,
  type CreateChannelInput,
  type Me,
  type NotificationChannel,
  type NotificationChannelType,
  type PushDevice,
} from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import {
  BellRing,
  Ellipsis,
  Laptop,
  Mail,
  Plus,
  Send,
  Server,
  Smartphone,
  Tablet,
  Trash2,
  Webhook,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Dialog } from '../../components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { Field } from '../../components/ui/field'
import { GroupedRow, GroupedSection } from '../../components/ui/grouped'
import { IconButton } from '../../components/ui/icon-button'
import { Input, PasswordInput } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { Spinner } from '../../components/ui/spinner'
import { Switch } from '../../components/ui/switch'
import { inputClassName } from '../../components/ui/styles'
import { toast } from '../../components/ui/toast-store'
import { ApiError, fieldErrors } from '../../lib/api'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { describeUserAgent, formatRelative } from '../../lib/format'
import { translateMessage } from '../../lib/i18n'
import { useUpdateMe } from '../../lib/queries'
import {
  channelsQuery,
  useCreateChannel,
  useDeleteChannel,
  useRemovePushDevice,
  useTestChannel,
  useTestPush,
  useUpdateChannel,
} from '../notifications/data'
import { PushPermissionError, usePushState } from '../notifications/push'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'
import { useSettingsBack } from './use-settings-back'

export function NotificationsSettingsPage() {
  const { t } = useTranslation()
  const me = useMe()
  return (
    <Page title={t('settings.sections.notifications')} backTo={useSettingsBack()} variant="grouped">
      <div className="flex flex-col gap-8">
        <PushSection />
        <ChannelsSection me={me} />
        <PreferencesSection me={me} />
      </div>
    </Page>
  )
}

/* ── This device (Web Push) ────────────────────────────────────── */

function deviceName(userAgent: string | null, t: TFunction) {
  const device = describeUserAgent(userAgent)
  const name =
    device.browser && device.os
      ? t('settings.sessions.deviceOn', { browser: device.browser, os: device.os })
      : (device.browser ?? device.os ?? t('settings.sessions.unknownDevice'))
  const Icon = device.kind === 'phone' ? Smartphone : device.kind === 'tablet' ? Tablet : Laptop
  return { name, Icon }
}

function PushSection() {
  const { t } = useTranslation()
  const push = usePushState()
  const testPush = useTestPush()
  const [busy, setBusy] = useState(false)
  const switchId = useId()
  const hintId = useId()
  const on = push.device !== undefined

  const toggle = async (enable: boolean) => {
    setBusy(true)
    try {
      if (enable) {
        await push.enable()
        toast.success(t('settings.notifications.pushOn'))
      } else {
        await push.disable()
        toast.success(t('settings.notifications.pushOff'))
      }
    } catch (error) {
      if (!(error instanceof PushPermissionError)) {
        toast.error(
          error instanceof ApiError ? errorMessage(error) : t('settings.notifications.pushFailed'),
        )
      }
    } finally {
      setBusy(false)
    }
  }

  const problem =
    push.support === 'insecure'
      ? t('settings.notifications.pushInsecure')
      : push.support === 'unsupported'
        ? t('settings.notifications.pushUnsupported')
        : push.permission === 'denied'
          ? t('settings.notifications.pushDenied')
          : undefined
  const others = push.status?.devices.filter((device) => device.id !== push.device?.id) ?? []

  return (
    <>
      <GroupedSection title={t('settings.notifications.device')}>
        <GroupedRow
          label={<label htmlFor={switchId}>{t('settings.notifications.push')}</label>}
          description={<span id={hintId}>{problem ?? t('settings.notifications.pushHint')}</span>}
        >
          {busy && <Spinner className="size-4" label={t('common.loading')} />}
          <Switch
            id={switchId}
            aria-describedby={hintId}
            checked={on}
            disabled={problem !== undefined || !push.status || busy}
            onCheckedChange={(checked) => void toggle(checked)}
          />
        </GroupedRow>
        {on && (
          <div className="flex justify-end px-4 py-2">
            <Button
              variant="plain"
              size="sm"
              loading={testPush.isPending}
              onClick={() =>
                testPush.mutate(undefined, {
                  onSuccess: () => toast.success(t('settings.notifications.testSent')),
                  onError: (error) => toast.error(failureMessage(error, t)),
                })
              }
            >
              <Send aria-hidden />
              {t('settings.notifications.sendTest')}
            </Button>
          </div>
        )}
      </GroupedSection>
      {others.length > 0 && (
        <GroupedSection title={t('settings.notifications.otherDevices')}>
          {others.map((device) => (
            <PushDeviceRow key={device.id} device={device} />
          ))}
        </GroupedSection>
      )}
    </>
  )
}

function PushDeviceRow({ device }: { device: PushDevice }) {
  const { t, i18n } = useTranslation()
  const remove = useRemovePushDevice()
  const { name, Icon } = deviceName(device.userAgent, t)
  return (
    <GroupedRow
      icon={<Icon />}
      label={name}
      description={formatRelative(device.createdAt, i18n.language)}
    >
      <IconButton
        label={t('settings.notifications.removeDevice', { name })}
        onClick={() =>
          remove.mutate(device.id, {
            onSuccess: () => toast.success(t('settings.notifications.deviceRemoved')),
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      >
        <Trash2 />
      </IconButton>
    </GroupedRow>
  )
}

/* ── Other services ────────────────────────────────────────────── */

type Translate = TFunction

/** A readable reason for a failed delivery (`timeout`, `http:401`, …). */
function describeFailure(reason: string, t: Translate): string {
  const [code, status] = reason.split(':')
  if (code === 'http') return t('settings.notifications.failure.http', { status })
  const known = ['timeout', 'dns', 'unreachable', 'blocked', 'smtp', 'config', 'gone'] as const
  const match = known.find((item) => item === code)
  return match ? t(`settings.notifications.failure.${match}`) : reason
}

function failureMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError && error.code === 'delivery_failed') {
    const reason = (error.details as { reason?: unknown } | undefined)?.reason
    if (typeof reason === 'string') {
      return `${errorMessage(error)} ${describeFailure(reason, t)}`
    }
  }
  return errorMessage(error)
}

const CHANNEL_ICONS: Record<NotificationChannelType, LucideIcon> = {
  ntfy: BellRing,
  gotify: Server,
  apprise: Webhook,
  email: Mail,
}

function ChannelsSection({ me }: { me: Me }) {
  const { t } = useTranslation()
  const channels = useQuery(channelsQuery)
  const [addOpen, setAddOpen] = useState(false)

  return (
    <GroupedSection
      title={t('settings.notifications.channels')}
      footer={t('settings.notifications.channelsHint')}
      actions={
        <Button variant="plain" size="sm" onClick={() => setAddOpen(true)}>
          <Plus aria-hidden />
          {t('settings.notifications.addChannel')}
        </Button>
      }
    >
      {channels.isPending ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-5" label={t('common.loading')} />
        </div>
      ) : channels.isError ? (
        <div className="p-4">
          <Alert>{errorMessage(channels.error)}</Alert>
        </div>
      ) : channels.data.length === 0 ? (
        <p className="px-4 py-3 text-callout text-text-secondary">
          {t('settings.notifications.noChannels')}
        </p>
      ) : (
        channels.data.map((channel) => <ChannelRow key={channel.id} channel={channel} />)
      )}
      <AddChannelDialog me={me} open={addOpen} onOpenChange={setAddOpen} />
    </GroupedSection>
  )
}

function ChannelRow({ channel }: { channel: NotificationChannel }) {
  const { t, i18n } = useTranslation()
  const update = useUpdateChannel()
  const test = useTestChannel()
  const remove = useDeleteChannel()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const Icon = CHANNEL_ICONS[channel.type]

  const status = channel.lastError
    ? t('settings.notifications.failed', { reason: describeFailure(channel.lastError, t) })
    : channel.lastSentAt
      ? t('settings.notifications.lastSent', {
          time: formatRelative(channel.lastSentAt, i18n.language),
        })
      : undefined

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-fill-control text-footnote font-bold text-text-secondary"
      >
        <Icon className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body">{channel.name}</span>
          <Badge tone="neutral">{t(`settings.notifications.types.${channel.type}`)}</Badge>
          {!channel.enabled && <Badge tone="neutral">{t('settings.notifications.paused')}</Badge>}
        </div>
        <div className="truncate text-subhead text-text-secondary">{channel.target}</div>
        {status && (
          <div
            className={cn(
              'text-footnote',
              channel.lastError ? 'text-danger' : 'text-text-secondary',
            )}
          >
            {status}
          </div>
        )}
      </div>
      <Switch
        aria-label={t('settings.notifications.enabled', { name: channel.name })}
        checked={channel.enabled}
        onCheckedChange={(enabled) =>
          update.mutate(
            { id: channel.id, input: { enabled } },
            { onError: (error) => toast.error(errorMessage(error)) },
          )
        }
      />
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('settings.notifications.actions', { name: channel.name })}
          className="flex size-8 cursor-default items-center justify-center rounded-lg text-text-secondary hover:bg-fill-hover hover:text-text data-[state=open]:bg-fill-selected pointer-coarse:size-11"
        >
          <Ellipsis aria-hidden className="size-4.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            icon={<Send />}
            onSelect={() =>
              test.mutate(channel.id, {
                onSuccess: () => toast.success(t('settings.notifications.testSent')),
                onError: (error) => toast.error(failureMessage(error, t)),
              })
            }
          >
            {t('settings.notifications.test')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => setConfirmOpen(true)}>
            {t('settings.notifications.remove')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('settings.notifications.removeTitle', { name: channel.name })}
        description={t('settings.notifications.removeBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync(channel.id)
            toast.success(t('settings.notifications.removed'))
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        }}
      />
    </div>
  )
}

interface ChannelDraft {
  name: string
  server: string
  topic: string
  token: string
  url: string
}

const EMPTY_DRAFT: ChannelDraft = { name: '', server: '', topic: '', token: '', url: '' }

function toInput(type: NotificationChannelType, draft: ChannelDraft): CreateChannelInput {
  const name = draft.name.trim()
  switch (type) {
    case 'ntfy':
      return {
        type,
        name,
        topic: draft.topic,
        ...(draft.server.trim() ? { server: draft.server } : {}),
        ...(draft.token.trim() ? { token: draft.token } : {}),
      }
    case 'gotify':
      return { type, name, server: draft.server, token: draft.token }
    case 'apprise':
      return { type, name, url: draft.url }
    case 'email':
      return { type, name }
  }
}

function AddChannelDialog({
  me,
  open,
  onOpenChange,
}: {
  me: Me
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const create = useCreateChannel()
  const test = useTestChannel()
  const [type, setType] = useState<NotificationChannelType>('ntfy')
  const [draft, setDraft] = useState<ChannelDraft>(EMPTY_DRAFT)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string>()

  const set = (field: keyof ChannelDraft) => (event: { target: { value: string } }) =>
    setDraft((current) => ({ ...current, [field]: event.target.value }))
  const fieldError = (field: string) =>
    errors[field] ? translateMessage(errors[field]) : undefined

  const close = () => {
    onOpenChange(false)
    setType('ntfy')
    setDraft(EMPTY_DRAFT)
    setErrors({})
    setFormError(undefined)
  }

  const submit = async () => {
    setErrors({})
    setFormError(undefined)
    const name = draft.name.trim() || t(`settings.notifications.types.${type}`)
    try {
      const channel = await create.mutateAsync(toInput(type, { ...draft, name }))
      toast.success(t('settings.notifications.added'))
      close()
      // A first message right away shows whether everything works.
      test.mutate(channel.id, { onError: (error) => toast.error(failureMessage(error, t)) })
    } catch (error) {
      const byField = fieldErrors(error)
      if (Object.keys(byField).length > 0) setErrors(byField)
      else setFormError(errorMessage(error))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={t('settings.notifications.addTitle')}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-4"
      >
        {formError && <Alert>{formError}</Alert>}
        <Field label={t('settings.notifications.type')}>
          {(props) => (
            <Select
              {...props}
              value={type}
              onChange={(event) => {
                setType(event.target.value as NotificationChannelType)
                setErrors({})
              }}
            >
              {NOTIFICATION_CHANNEL_TYPES.map((option) => (
                <option key={option} value={option}>
                  {t(`settings.notifications.types.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t('settings.notifications.name')} error={fieldError('name')} optional>
          {(props) => (
            <Input
              {...props}
              value={draft.name}
              maxLength={60}
              placeholder={t(`settings.notifications.types.${type}`)}
              onChange={set('name')}
            />
          )}
        </Field>

        {type === 'ntfy' && (
          <>
            <Field label={t('settings.notifications.server')} error={fieldError('server')} optional>
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  value={draft.server}
                  placeholder="https://ntfy.sh"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={set('server')}
                />
              )}
            </Field>
            <Field
              label={t('settings.notifications.topic')}
              description={t('settings.notifications.topicHint')}
              error={fieldError('topic')}
            >
              {(props) => (
                <Input
                  {...props}
                  value={draft.topic}
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={set('topic')}
                />
              )}
            </Field>
            <Field
              label={t('settings.notifications.token')}
              description={t('settings.notifications.tokenHint')}
              error={fieldError('token')}
              optional
            >
              {(props) => (
                <PasswordInput
                  {...props}
                  value={draft.token}
                  autoComplete="off"
                  onChange={set('token')}
                />
              )}
            </Field>
          </>
        )}

        {type === 'gotify' && (
          <>
            <Field label={t('settings.notifications.server')} error={fieldError('server')}>
              {(props) => (
                <Input
                  {...props}
                  type="url"
                  value={draft.server}
                  placeholder="https://gotify.example.com"
                  autoCapitalize="none"
                  spellCheck={false}
                  onChange={set('server')}
                />
              )}
            </Field>
            <Field
              label={t('settings.notifications.appToken')}
              description={t('settings.notifications.appTokenHint')}
              error={fieldError('token')}
            >
              {(props) => (
                <PasswordInput
                  {...props}
                  value={draft.token}
                  autoComplete="off"
                  onChange={set('token')}
                />
              )}
            </Field>
          </>
        )}

        {type === 'apprise' && (
          <Field
            label={t('settings.notifications.appriseUrl')}
            description={t('settings.notifications.appriseHint')}
            error={fieldError('url')}
          >
            {(props) => (
              <Input
                {...props}
                type="url"
                value={draft.url}
                autoCapitalize="none"
                spellCheck={false}
                onChange={set('url')}
                className="font-mono text-subhead"
              />
            )}
          </Field>
        )}

        {type === 'email' && (
          <p className="text-callout text-text-secondary">
            {me.email
              ? t('settings.notifications.emailTo', { email: me.email })
              : t('settings.notifications.emailMissing')}
          </p>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={close}>{t('common.cancel')}</Button>
          <Button
            type="submit"
            variant="primary"
            loading={create.isPending}
            disabled={type === 'email' && !me.email}
          >
            {t('common.add')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

/* ── What to be notified about ─────────────────────────────────── */

function PreferencesSection({ me }: { me: Me }) {
  const { t } = useTranslation()
  const update = useUpdateMe()
  const assignedId = useId()
  const summaryId = useId()
  const summaryHintId = useId()
  const timeId = useId()
  const [time, setTime] = useState(me.preferences.dailySummaryTime)

  const save = (preferences: Partial<Me['preferences']>) =>
    update.mutate({ preferences }, { onError: (error) => toast.error(errorMessage(error)) })

  return (
    <GroupedSection title={t('settings.notifications.about')}>
      <GroupedRow
        label={<label htmlFor={assignedId}>{t('settings.notifications.assigned')}</label>}
      >
        <Switch
          id={assignedId}
          checked={me.preferences.notifyAssigned}
          onCheckedChange={(notifyAssigned) => save({ notifyAssigned })}
        />
      </GroupedRow>
      <GroupedRow
        label={<label htmlFor={summaryId}>{t('settings.notifications.summary')}</label>}
        description={<span id={summaryHintId}>{t('settings.notifications.summaryHint')}</span>}
      >
        <Switch
          id={summaryId}
          aria-describedby={summaryHintId}
          checked={me.preferences.dailySummary}
          onCheckedChange={(dailySummary) => save({ dailySummary })}
        />
      </GroupedRow>
      {me.preferences.dailySummary && (
        <GroupedRow
          label={<label htmlFor={timeId}>{t('settings.notifications.summaryTime')}</label>}
        >
          <input
            id={timeId}
            type="time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            onBlur={() => {
              if (/^\d{2}:\d{2}$/.test(time) && time !== me.preferences.dailySummaryTime) {
                save({ dailySummaryTime: time })
              } else {
                setTime(me.preferences.dailySummaryTime)
              }
            }}
            className={cn(inputClassName, 'h-8 w-28 text-callout')}
          />
        </GroupedRow>
      )}
    </GroupedSection>
  )
}
