import { loginSchema } from '@crystal/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useSuspenseQuery } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Field } from '../../components/ui/field'
import { Input, PasswordInput } from '../../components/ui/input'
import { errorCodeMessage, errorMessage, safeRedirect } from '../../lib/errors'
import { authConfigQuery, useLogin } from '../../lib/queries'
import { AuthHeader } from './auth-layout'
import { Divider, SsoButton } from './sso-button'

const route = getRouteApi('/_auth/login')

export function LoginPage() {
  const { t } = useTranslation()
  const { data: config } = useSuspenseQuery(authConfigQuery)
  const search = route.useSearch()
  const navigate = useNavigate()
  const login = useLogin()

  const form = useForm({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await login.mutateAsync(values)
      await navigate({ to: safeRedirect(search.redirect), replace: true })
    } catch (error) {
      form.setError('root', { message: errorMessage(error) })
    }
  })

  const urlError = errorCodeMessage(search.error)
  const formError = errors.root?.message ?? urlError

  return (
    <>
      <AuthHeader
        title={t('auth.login.title')}
        subtitle={config.passwordLogin ? t('auth.login.subtitle') : t('auth.login.ssoOnly')}
      />
      {formError && <Alert className="mb-5">{formError}</Alert>}

      {config.oidc.enabled && (
        <>
          <SsoButton provider={config.oidc.buttonLabel} />
          {config.passwordLogin && <Divider label={t('auth.or')} />}
        </>
      )}

      {config.passwordLogin && (
        <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
          <Field label={t('auth.usernameOrEmail')} error={errors.identifier?.message}>
            {(props) => (
              <Input
                {...props}
                {...form.register('identifier')}
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
              />
            )}
          </Field>
          <Field label={t('auth.password')} error={errors.password?.message}>
            {(props) => (
              <PasswordInput
                {...props}
                {...form.register('password')}
                autoComplete="current-password"
              />
            )}
          </Field>
          {config.passwordReset && (
            <Link
              to="/forgot-password"
              className="-mt-2 self-end text-footnote font-medium text-accent-text hover:underline"
            >
              {t('auth.login.forgot')}
            </Link>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            loading={isSubmitting}
            className="mt-2 w-full"
          >
            {t('auth.login.submit')}
          </Button>
        </form>
      )}

      {config.registration === 'open' && config.passwordLogin && (
        <p className="mt-6 text-center text-callout text-text-secondary">
          {t('auth.login.noAccount')}{' '}
          <Link to="/register" className="font-medium text-accent-text hover:underline">
            {t('auth.login.register')}
          </Link>
        </p>
      )}
    </>
  )
}
