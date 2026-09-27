import {
  INVITE_NOTE_MAX_LENGTH,
  type CreatedInvite,
  type Invite,
  type InviteStatus,
  type Role,
} from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { Check, Copy, Plus, Ticket } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Dialog } from '../../components/ui/dialog'
import { EmptyState } from '../../components/ui/empty-state'
import { Field } from '../../components/ui/field'
import { GroupedSection } from '../../components/ui/grouped'
import { Input } from '../../components/ui/input'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Select } from '../../components/ui/select'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { errorMessage } from '../../lib/errors'
import { formatDate } from '../../lib/format'
import {
  adminInvitesQuery,
  authConfigQuery,
  useCreateInvite,
  useRevokeInvite,
} from '../../lib/queries'
import { Page } from '../shell/page'
import { useSettingsBack } from './use-settings-back'

const STATUS_TONE: Record<InviteStatus, 'success' | 'neutral' | 'danger'> = {
  active: 'success',
  used: 'neutral',
  expired: 'neutral',
  revoked: 'danger',
}

export function InvitesSettingsPage() {
  const { t } = useTranslation()
  const invites = useQuery(adminInvitesQuery)
  const { data: config } = useQuery(authConfigQuery)
  const [createOpen, setCreateOpen] = useState(false)
  const closed = config?.registration === 'closed'

  return (
    <Page
      title={t('settings.sections.invites')}
      backTo={useSettingsBack()}
      variant="grouped"
      actions={
        // The empty state has its own button; avoid showing the same action twice.
        !closed &&
        (invites.data?.length ?? 0) > 0 && (
          <Button variant="plain" onClick={() => setCreateOpen(true)}>
            <Plus aria-hidden />
            {t('settings.invites.create')}
          </Button>
        )
      }
    >
      <div className="flex flex-col gap-6">
        {closed && <Alert tone="info">{t('settings.invites.registrationClosed')}</Alert>}
        {config?.registration === 'open' && (
          <Alert tone="info">{t('settings.invites.registrationOpen')}</Alert>
        )}

        {invites.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner className="size-5" label={t('common.loading')} />
          </div>
        ) : invites.isError ? (
          <Alert>{errorMessage(invites.error)}</Alert>
        ) : invites.data.length === 0 ? (
          <EmptyState
            icon={<Ticket />}
            title={t('settings.invites.empty')}
            body={t('settings.invites.emptyBody')}
            action={
              !closed && (
                <Button variant="primary" onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden />
                  {t('settings.invites.create')}
                </Button>
              )
            }
          />
        ) : (
          <GroupedSection title={t('settings.invites.title')} footer={t('settings.invites.hint')}>
            {invites.data.map((invite) => (
              <InviteRow key={invite.id} invite={invite} />
            ))}
          </GroupedSection>
        )}
      </div>
      <CreateInviteDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Page>
  )
}

function InviteRow({ invite }: { invite: Invite }) {
  const { t, i18n } = useTranslation()
  const revoke = useRevokeInvite()
  const [confirmOpen, setConfirmOpen] = useState(false)

  const meta = [
    t('settings.invites.uses', { uses: invite.uses, max: invite.maxUses }),
    invite.status === 'active'
      ? invite.expiresAt
        ? t('settings.invites.expires', { date: formatDate(invite.expiresAt, i18n.language) })
        : t('settings.invites.noExpiry')
      : undefined,
    invite.createdBy ? t('settings.invites.createdBy', { name: invite.createdBy }) : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body font-medium">
            {invite.note ?? formatDate(invite.createdAt, i18n.language)}
          </span>
          <Badge tone={STATUS_TONE[invite.status]}>
            {t(`settings.invites.status.${invite.status}`)}
          </Badge>
          {invite.role === 'admin' && <Badge tone="accent">{t('settings.users.admin')}</Badge>}
        </div>
        <div className="text-subhead text-text-secondary">{meta}</div>
      </div>
      {invite.status === 'active' && (
        <Button variant="destructive-plain" size="sm" onClick={() => setConfirmOpen(true)}>
          {t('common.revoke')}
        </Button>
      )}
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('settings.invites.revokeTitle')}
        description={t('settings.invites.revokeBody')}
        confirmLabel={t('common.revoke')}
        destructive
        onConfirm={async () => {
          try {
            await revoke.mutateAsync(invite.id)
            toast.success(t('settings.invites.revoked'))
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        }}
      />
    </div>
  )
}

const USE_OPTIONS = [1, 5, 10, 25]
const EXPIRY_OPTIONS = ['1', '7', '30', 'never'] as const

function CreateInviteDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const create = useCreateInvite()
  const [role, setRole] = useState<Role>('user')
  const [maxUses, setMaxUses] = useState(1)
  const [expiry, setExpiry] = useState<(typeof EXPIRY_OPTIONS)[number]>('7')
  const [note, setNote] = useState('')
  const [created, setCreated] = useState<CreatedInvite | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setRole('user')
    setMaxUses(1)
    setExpiry('7')
    setNote('')
    setCreated(null)
    setError(null)
  }

  const submit = async () => {
    setError(null)
    try {
      const invite = await create.mutateAsync({
        role,
        maxUses,
        expiresInDays: expiry === 'never' ? null : Number(expiry),
        ...(note.trim() ? { note: note.trim() } : {}),
      })
      setCreated(invite)
    } catch (caught) {
      setError(errorMessage(caught))
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset()
        onOpenChange(next)
      }}
      title={created ? t('settings.invites.createdTitle') : t('settings.invites.create')}
      description={created ? t('settings.invites.createdBody') : undefined}
    >
      {created ? (
        <CreatedLink token={created.token} onDone={() => onOpenChange(false)} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-4"
        >
          {error && <Alert>{error}</Alert>}
          <div className="flex flex-col gap-1.5">
            <span id="invite-role" className="text-subhead font-medium">
              {t('settings.invites.role')}
            </span>
            <SegmentedControl
              aria-labelledby="invite-role"
              className="w-full"
              value={role}
              onValueChange={setRole}
              options={[
                { value: 'user', label: t('settings.users.member') },
                { value: 'admin', label: t('settings.users.admin') },
              ]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('settings.invites.maxUses')}>
              {(props) => (
                <Select
                  {...props}
                  value={maxUses}
                  onChange={(event) => setMaxUses(Number(event.target.value))}
                >
                  {USE_OPTIONS.map((count) => (
                    <option key={count} value={count}>
                      {count === 1
                        ? t('settings.invites.usesOnce')
                        : t('settings.invites.usesTimes', { count })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label={t('settings.invites.expiresIn')}>
              {(props) => (
                <Select
                  {...props}
                  value={expiry}
                  onChange={(event) =>
                    setExpiry(event.target.value as (typeof EXPIRY_OPTIONS)[number])
                  }
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option === 'never'
                        ? t('settings.invites.noExpiry')
                        : option === '1'
                          ? t('settings.invites.oneDay')
                          : t('settings.invites.days', { count: Number(option) })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </div>
          <Field label={t('settings.invites.note')} optional>
            {(props) => (
              <Input
                {...props}
                value={note}
                maxLength={INVITE_NOTE_MAX_LENGTH}
                placeholder={t('settings.invites.notePlaceholder')}
                onChange={(event) => setNote(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary" loading={create.isPending}>
              {t('common.create')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function CreatedLink({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/invite/${token}`

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error(t('errors.unexpected'))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input
          readOnly
          value={link}
          aria-label={t('settings.invites.createdTitle')}
          onFocus={(event) => event.target.select()}
          className="font-mono text-subhead"
          data-testid="invite-link"
        />
        <Button variant="secondary" onClick={() => void copy()} className="h-9 pointer-coarse:h-11">
          {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
          {copied ? t('common.copied') : t('common.copy')}
        </Button>
      </div>
      <div className="flex justify-end">
        <Button variant="primary" onClick={onDone}>
          {t('common.close')}
        </Button>
      </div>
    </div>
  )
}
