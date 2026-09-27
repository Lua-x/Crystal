import { useQuery, useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { TicketX } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { EmptyState } from '../../components/ui/empty-state'
import { Spinner } from '../../components/ui/spinner'
import { authConfigQuery, invitePreviewQuery } from '../../lib/queries'
import { AuthHeader } from './auth-layout'
import { RegisterForm } from './register-form'
import { Divider, SsoButton } from './sso-button'

/** First run: the account created here becomes the administrator. */
export function SetupPage() {
  const { t } = useTranslation()
  const { data: config } = useSuspenseQuery(authConfigQuery)
  return (
    <>
      <AuthHeader title={t('auth.setup.title')} subtitle={t('auth.setup.subtitle')} />
      {config.oidc.enabled && (
        <>
          <SsoButton provider={config.oidc.buttonLabel} />
          {config.passwordLogin && <Divider label={t('auth.or')} />}
        </>
      )}
      {config.passwordLogin && <RegisterForm submitLabel={t('auth.setup.submit')} />}
    </>
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
