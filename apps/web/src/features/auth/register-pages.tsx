import { INSTANCE_MODES, type InstanceMode } from '@crystal/shared'
import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { Gamepad2, ListChecks, TicketX } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { cn } from '../../lib/cn'
import { authConfigQuery, invitePreviewQuery } from '../../lib/queries'
import { AuthHeader } from './auth-layout'
import { RegisterForm } from './register-form'
import { Divider, SsoButton } from './sso-button'

/** First run: the account created here becomes the administrator. */
export function SetupPage() {
  const { t } = useTranslation()
  const { data: config } = useSuspenseQuery(authConfigQuery)
  const [picked, setPicked] = useState<InstanceMode>('standard')
  // Once chosen, the mode stays – even if every account was removed since.
  const mode = config.mode === null ? picked : undefined
  return (
    <>
      <AuthHeader title={t('auth.setup.title')} subtitle={t('auth.setup.subtitle')} />
      {mode && <ModePicker value={mode} onChange={setPicked} />}
      {config.oidc.enabled && (
        <>
          <SsoButton provider={config.oidc.buttonLabel} {...(mode ? { mode } : {})} />
          {config.passwordLogin && <Divider label={t('auth.or')} />}
        </>
      )}
      {config.passwordLogin && (
        <RegisterForm submitLabel={t('auth.setup.submit')} {...(mode ? { mode } : {})} />
      )}
    </>
  )
}

const MODE_ICONS: Record<InstanceMode, ReactNode> = {
  standard: <ListChecks />,
  gaming: <Gamepad2 />,
}

/** Everyday lists or games – chosen once for the whole instance. */
function ModePicker({
  value,
  onChange,
}: {
  value: InstanceMode
  onChange: (mode: InstanceMode) => void
}) {
  const { t } = useTranslation()
  return (
    <fieldset className="mb-6 flex flex-col gap-2">
      <legend className="mb-2 text-subhead font-medium">{t('auth.setup.modeLabel')}</legend>
      <RadioGroup.Root
        value={value}
        onValueChange={(next) => onChange(next as InstanceMode)}
        aria-describedby="setup-mode-hint"
        className="grid gap-2 sm:grid-cols-2"
      >
        {INSTANCE_MODES.map((mode) => (
          <RadioGroup.Item
            key={mode}
            value={mode}
            aria-labelledby={`setup-mode-${mode}`}
            aria-describedby={`setup-mode-${mode}-body`}
            className={cn(
              'flex cursor-default flex-col items-start gap-1.5 rounded-xl border border-border-control bg-cell p-3.5 text-left transition-colors hover:bg-fill-hover',
              'data-[state=checked]:border-accent data-[state=checked]:bg-accent-soft data-[state=checked]:ring-1 data-[state=checked]:ring-accent',
            )}
          >
            <span className="flex items-center gap-2 text-accent-text [&_svg]:size-5">
              {MODE_ICONS[mode]}
              <span id={`setup-mode-${mode}`} className="text-callout font-semibold text-text">
                {t(`auth.setup.modes.${mode}`)}
              </span>
            </span>
            <span id={`setup-mode-${mode}-body`} className="text-footnote text-text-secondary">
              {t(`auth.setup.modes.${mode}-body`)}
            </span>
          </RadioGroup.Item>
        ))}
      </RadioGroup.Root>
      <p id="setup-mode-hint" className="text-footnote text-text-secondary">
        {t('auth.setup.modeHint')}
      </p>
    </fieldset>
  )
}

export function RegisterPage() {
  const { t } = useTranslation()
  return (
    <>
      <AuthHeader title={t('auth.register.title')} subtitle={t('auth.register.subtitle')} />
      <RegisterForm submitLabel={t('auth.register.submit')} />
      <SignInHint />
    </>
  )
}

const inviteRoute = getRouteApi('/_auth/invite/$token')

export function InvitePage() {
  const { t } = useTranslation()
  const { token } = inviteRoute.useParams()
  const invite = useQuery(invitePreviewQuery(token))

  if (invite.isPending) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-callout text-text-secondary">
        <Spinner className="size-5" />
        {t('auth.invite.checking')}
      </div>
    )
  }

  if (invite.isError) {
    return (
      <EmptyState
        className="py-4"
        icon={<TicketX />}
        title={t('auth.invite.invalidTitle')}
        body={t('errors.invite_invalid')}
        action={
          <Button asChild variant="secondary">
            <Link to="/login">{t('auth.register.signIn')}</Link>
          </Button>
        }
      />
    )
  }

  return (
    <>
      <AuthHeader
        title={t('auth.invite.title')}
        subtitle={
          invite.data.invitedBy
            ? t('auth.invite.subtitle', { name: invite.data.invitedBy })
            : t('auth.invite.subtitleAnonymous')
        }
      />
      {invite.data.role === 'admin' && (
        <p className="-mt-3 mb-5 text-center text-subhead text-text-secondary">
          {t('auth.invite.adminNote')}
        </p>
      )}
      <RegisterForm submitLabel={t('auth.register.submit')} inviteToken={token} />
      <SignInHint />
    </>
  )
}

function SignInHint() {
  const { t } = useTranslation()
  return (
    <p className="mt-6 text-center text-callout text-text-secondary">
      {t('auth.register.haveAccount')}{' '}
      <Link to="/login" className="font-medium text-accent-text hover:underline">
        {t('auth.register.signIn')}
      </Link>
    </p>
  )
}
