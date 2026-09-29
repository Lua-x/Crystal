import {
  API_TOKEN_NAME_MAX_LENGTH,
  type ApiToken,
  type ApiTokenScope,
  type CreateApiTokenInput,
  type CreatedApiToken,
} from '@crystal/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, KeyRound, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Badge } from '../../components/ui/badge'
import { Button } from '../../components/ui/button'
import { ConfirmDialog } from '../../components/ui/confirm-dialog'
import { Dialog } from '../../components/ui/dialog'
import { Field } from '../../components/ui/field'
import { GroupedSection } from '../../components/ui/grouped'
import { IconButton } from '../../components/ui/icon-button'
import { Input } from '../../components/ui/input'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Select } from '../../components/ui/select'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { formatDate, formatRelative } from '../../lib/format'
import { useClock } from '../../lib/use-clock'
import { Page } from '../shell/page'
import { useSettingsBack } from './use-settings-back'

const tokensKey = ['me', 'tokens'] as const
const tokensQuery = queryOptions({
  queryKey: tokensKey,
  queryFn: () => api<ApiToken[]>('/me/tokens'),
})

function useCreateToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: CreateApiTokenInput) =>
      api<CreatedApiToken>('/me/tokens', { method: 'POST', body: input }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tokensKey }),
  })
}

function useRevokeToken() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api<void>(`/me/tokens/${id}`, { method: 'DELETE' }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tokensKey }),
  })
}

export function ApiSettingsPage() {
  const { t } = useTranslation()
  const tokens = useQuery(tokensQuery)
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <Page title={t('settings.sections.api')} backTo={useSettingsBack()} variant="grouped">
      <div className="flex flex-col gap-8">
        <GroupedSection
          title={t('settings.api.title')}
          footer={t('settings.api.hint')}
          actions={
            <Button variant="plain" size="sm" onClick={() => setCreateOpen(true)}>
              <Plus aria-hidden />
              {t('settings.api.create')}
            </Button>
          }
        >
          {tokens.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner className="size-5" label={t('common.loading')} />
            </div>
          ) : tokens.isError ? (
            <div className="p-4">
              <Alert>{errorMessage(tokens.error)}</Alert>
            </div>
          ) : tokens.data.length === 0 ? (
            <p className="px-4 py-3 text-callout text-text-secondary">{t('settings.api.empty')}</p>
          ) : (
            tokens.data.map((token) => <TokenRow key={token.id} token={token} />)
          )}
        </GroupedSection>

        <section className="flex flex-col gap-2 px-1">
          <a
            href="/api/docs"
            target="_blank"
            rel="noopener"
            className="inline-flex w-fit items-center gap-1.5 text-callout font-medium text-accent-text hover:underline"
          >
            {t('settings.api.docs')}
            <ExternalLink aria-hidden className="size-4" />
          </a>
          <p className="text-footnote text-text-secondary">
            {t('settings.api.docsHint', { header: 'Authorization: Bearer crystal_…' })}
          </p>
        </section>
      </div>
      <CreateTokenDialog open={createOpen} onOpenChange={setCreateOpen} />
    </Page>
  )
}

function TokenRow({ token }: { token: ApiToken }) {
  const { t, i18n } = useTranslation()
  const revoke = useRevokeToken()
  const now = useClock()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const expired = token.expiresAt !== null && Date.parse(token.expiresAt) <= now

  const meta = [
    t('settings.api.created', { date: formatDate(token.createdAt, i18n.language) }),
    token.lastUsedAt
      ? t('settings.api.lastUsed', { time: formatRelative(token.lastUsedAt, i18n.language) })
      : t('settings.api.neverUsed'),
    token.expiresAt && !expired
      ? t('settings.api.expires', { date: formatDate(token.expiresAt, i18n.language) })
      : undefined,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <KeyRound aria-hidden className="size-5 shrink-0 text-text-secondary" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-body">{token.name}</span>
          <Badge tone={token.scope === 'write' ? 'accent' : 'neutral'}>
            {t(`settings.api.${token.scope}`)}
          </Badge>
          {expired && <Badge tone="danger">{t('settings.api.expired')}</Badge>}
        </div>
        <div className="truncate font-mono text-footnote text-text-secondary">{token.hint}…</div>
        <div className="text-footnote text-text-secondary">{meta}</div>
      </div>
      <IconButton
        label={t('settings.api.revokeLabel', { name: token.name })}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 />
      </IconButton>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('settings.api.revokeTitle', { name: token.name })}
        description={t('settings.api.revokeBody')}
        confirmLabel={t('common.revoke')}
        destructive
        onConfirm={async () => {
          try {
            await revoke.mutateAsync(token.id)
            toast.success(t('settings.api.revoked'))
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        }}
      />
    </div>
  )
}

const EXPIRY_OPTIONS = ['30', '90', '365', 'never'] as const
type Expiry = (typeof EXPIRY_OPTIONS)[number]

function CreateTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const create = useCreateToken()
  const [name, setName] = useState('')
  const [scope, setScope] = useState<ApiTokenScope>('read')
  const [expiry, setExpiry] = useState<Expiry>('90')
  const [created, setCreated] = useState<CreatedApiToken | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setName('')
    setScope('read')
    setExpiry('90')
    setCreated(null)
    setError(null)
  }

  const submit = async () => {
    setError(null)
    try {
      setCreated(
        await create.mutateAsync({
          name: name.trim(),
          scope,
          expiresInDays: expiry === 'never' ? null : Number(expiry),
        }),
      )
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
      title={created ? t('settings.api.createdTitle') : t('settings.api.createTitle')}
      description={created ? t('settings.api.createdBody') : undefined}
    >
      {created ? (
        <CreatedToken token={created.token} onDone={() => onOpenChange(false)} />
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
          className="flex flex-col gap-4"
        >
          {error && <Alert>{error}</Alert>}
          <Field label={t('settings.api.name')}>
            {(props) => (
              <Input
                {...props}
                value={name}
                required
                maxLength={API_TOKEN_NAME_MAX_LENGTH}
                placeholder={t('settings.api.namePlaceholder')}
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </Field>
          <div className="flex flex-col gap-1.5">
            <span id="token-access" className="text-subhead font-medium">
              {t('settings.api.access')}
            </span>
            <SegmentedControl
              aria-labelledby="token-access"
              className="w-full"
              value={scope}
              onValueChange={setScope}
              options={[
                { value: 'read', label: t('settings.api.read') },
                { value: 'write', label: t('settings.api.write') },
              ]}
            />
          </div>
          <Field label={t('settings.api.validFor')}>
            {(props) => (
              <Select
                {...props}
                value={expiry}
                onChange={(event) => setExpiry(event.target.value as Expiry)}
              >
                {EXPIRY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option === 'never'
                      ? t('settings.api.noExpiry')
                      : option === '365'
                        ? t('settings.api.oneYear')
                        : t('settings.api.days', { count: Number(option) })}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button
              type="submit"
              variant="primary"
              loading={create.isPending}
              disabled={!name.trim()}
            >
              {t('common.create')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  )
}

function CreatedToken({ token, onDone }: { token: string; onDone: () => void }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
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
          value={token}
          aria-label={t('settings.api.createdTitle')}
          onFocus={(event) => event.target.select()}
          className="font-mono text-subhead"
          data-testid="api-token"
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
