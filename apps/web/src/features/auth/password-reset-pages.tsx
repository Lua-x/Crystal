import { forgotPasswordSchema, passwordSchema } from '@crystal/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import { MailCheck } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Field } from '../../components/ui/field'
import { Input, PasswordInput } from '../../components/ui/input'
import { toast } from '../../components/ui/toast-store'
import { api, ApiError } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { AuthHeader } from './auth-layout'

const linkClassName = 'font-medium text-accent-text hover:underline'

export function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [sent, setSent] = useState(false)
  const form = useForm({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { identifier: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api<void>('/auth/forgot-password', { method: 'POST', body: values })
      setSent(true)
    } catch (error) {
      form.setError('root', { message: errorMessage(error) })
    }
  })

  if (sent) {
    return (
      <div role="status" className="flex flex-col items-center text-center">
        <MailCheck aria-hidden className="mb-3 size-10 text-accent-text" />
        <AuthHeader title={t('auth.forgot.sentTitle')} subtitle={t('auth.forgot.sent')} />
        <p className="mb-6 text-footnote text-text-secondary">{t('auth.forgot.noEmail')}</p>
        <Link to="/login" className={linkClassName}>
          {t('auth.forgot.back')}
        </Link>
      </div>
    )
  }

  return (
    <>
      <AuthHeader title={t('auth.forgot.title')} subtitle={t('auth.forgot.subtitle')} />
      {errors.root?.message && <Alert className="mb-5">{errors.root.message}</Alert>}
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
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
          {t('auth.forgot.submit')}
        </Button>
      </form>
      <p className="mt-6 text-center text-callout">
        <Link to="/login" className={linkClassName}>
          {t('auth.forgot.back')}
        </Link>
      </p>
    </>
  )
}

const route = getRouteApi('/_auth/reset-password')
const resetSchema = z.object({ password: passwordSchema })

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const { token } = route.useSearch()
  const navigate = useNavigate()
  const [invalid, setInvalid] = useState(!token)
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await api<void>('/auth/reset-password', { method: 'POST', body: { token, password } })
      toast.success(t('auth.reset.done'))
      await navigate({ to: '/login', replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'reset_invalid') setInvalid(true)
      else form.setError('root', { message: errorMessage(error) })
    }
  })

  if (invalid) {
    return (
      <>
        <AuthHeader title={t('auth.reset.title')} />
        <Alert className="mb-5">
          {token ? t('errors.reset_invalid') : t('auth.reset.missingToken')}
        </Alert>
        <p className="text-center text-callout">
          <Link to="/forgot-password" className={linkClassName}>
            {t('auth.reset.requestNew')}
          </Link>
        </p>
      </>
    )
  }

  return (
    <>
      <AuthHeader title={t('auth.reset.title')} subtitle={t('auth.reset.subtitle')} />
      {errors.root?.message && <Alert className="mb-5">{errors.root.message}</Alert>}
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        <Field
          label={t('settings.account.newPassword')}
          description={t('auth.passwordHint')}
          error={errors.password?.message}
        >
          {(props) => (
            <PasswordInput {...props} {...form.register('password')} autoComplete="new-password" />
          )}
        </Field>
        <Button type="submit" variant="primary" size="lg" loading={isSubmitting} className="w-full">
          {t('auth.reset.submit')}
        </Button>
      </form>
    </>
  )
}
