import { emailSchema, registerSchema, type Locale } from '@crystal/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Field } from '../../components/ui/field'
import { Input, PasswordInput } from '../../components/ui/input'
import { ApiError, fieldErrors } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { deviceTimeZone } from '../../lib/format'
import { useRegister } from '../../lib/queries'
import { suggestUsername } from './suggest-username'

// The form keeps an empty string for "no email"; the API expects the field to be absent.
const formSchema = registerSchema
  .pick({ username: true, displayName: true, password: true })
  .extend({ email: z.union([z.literal(''), emailSchema]) })

type FormValues = z.input<typeof formSchema>
const FIELDS = ['username', 'displayName', 'email', 'password'] as const

interface RegisterFormProps {
  submitLabel: string
  inviteToken?: string
}

export function RegisterForm({ submitLabel, inviteToken }: RegisterFormProps) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const register = useRegister()

  const form = useForm<FormValues, unknown, z.output<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { displayName: '', username: '', email: '', password: '' },
  })
  const { errors, isSubmitting, dirtyFields } = form.formState

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await register.mutateAsync({
        username: values.username,
        displayName: values.displayName,
        password: values.password,
        ...(values.email ? { email: values.email } : {}),
        ...(inviteToken ? { inviteToken } : {}),
        locale: i18n.language as Locale,
        timezone: deviceTimeZone(),
      })
      await navigate({ to: '/', replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.code === 'username_taken') {
        form.setError('username', { message: errorMessage(error) }, { shouldFocus: true })
      } else if (error instanceof ApiError && error.code === 'email_taken') {
        form.setError('email', { message: errorMessage(error) }, { shouldFocus: true })
      } else {
        const byField = fieldErrors(error)
        const known = FIELDS.filter((field) => byField[field])
        for (const field of known) form.setError(field, { message: byField[field] })
        if (known.length === 0) form.setError('root', { message: errorMessage(error) })
      }
    }
  })

  const displayNameField = form.register('displayName', {
    onChange: (event: { target: { value: string } }) => {
      // Keep suggesting a username until the user edits it themselves.
      if (!dirtyFields.username) {
        form.setValue('username', suggestUsername(event.target.value))
      }
    },
  })

  return (
    <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
      {errors.root?.message && <Alert>{errors.root.message}</Alert>}
      <Field
        label={t('auth.displayName')}
        description={t('auth.displayNameHint')}
        error={errors.displayName?.message}
      >
        {(props) => <Input {...props} {...displayNameField} autoComplete="name" />}
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
      <Field
        label={t('auth.password')}
        description={t('auth.passwordHint')}
        error={errors.password?.message}
      >
        {(props) => (
          <PasswordInput {...props} {...form.register('password')} autoComplete="new-password" />
        )}
      </Field>
      <Button
        type="submit"
        variant="primary"
        size="lg"
        loading={isSubmitting}
        className="mt-2 w-full"
      >
        {submitLabel}
      </Button>
    </form>
  )
}
