import { passwordSchema, type AdminUser } from '@crystal/shared'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Ellipsis, KeyRound, ShieldCheck, ShieldOff, Trash2, UserCheck, UserX } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'

import { Alert } from '../../components/ui/alert'
import { Avatar } from '../../components/ui/avatar'
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
import { GroupedSection } from '../../components/ui/grouped'
import { PasswordInput } from '../../components/ui/input'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { formatRelative } from '../../lib/format'
import { adminUsersQuery, useAdminDeleteUser, useAdminUpdateUser } from '../../lib/queries'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'
import { useSettingsBack } from './use-settings-back'

export function UsersSettingsPage() {
  const { t } = useTranslation()
  const users = useQuery(adminUsersQuery)

  return (
    <Page title={t('settings.sections.users')} backTo={useSettingsBack()} variant="grouped">
      {users.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" label={t('common.loading')} />
        </div>
      ) : users.isError ? (
        <Alert>{errorMessage(users.error)}</Alert>
      ) : (
        <GroupedSection title={t('settings.users.title')} footer={t('settings.users.hint')}>
          {users.data.map((user) => (
            <UserRow key={user.id} user={user} />
          ))}
        </GroupedSection>
      )}
    </Page>
  )
}

function UserRow({ user }: { user: AdminUser }) {
  const { t, i18n } = useTranslation()
  const me = useMe()
  const update = useAdminUpdateUser()
  const remove = useAdminDeleteUser()
  const [dialog, setDialog] = useState<'delete' | 'password' | null>(null)
  const isSelf = user.id === me.id

  const apply = (input: Parameters<typeof update.mutate>[0]['input']) => {
    update.mutate(
      { id: user.id, input },
      {
        onSuccess: () => toast.success(t('settings.users.updated')),
        onError: (error) => toast.error(errorMessage(error)),
      },
    )
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar name={user.displayName} className={cn('size-9', user.disabled && 'opacity-50')} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-body font-medium">
            {user.displayName}
            {isSelf && (
              <span className="font-regular text-text-secondary"> ({t('common.you')})</span>
            )}
          </span>
          {user.role === 'admin' && <Badge tone="accent">{t('settings.users.admin')}</Badge>}
          {user.disabled && <Badge tone="danger">{t('settings.users.disabled')}</Badge>}
          {user.ssoLinked && <Badge>{t('settings.users.sso')}</Badge>}
        </div>
        <div className="truncate text-subhead text-text-secondary">
          @{user.username}
          {' · '}
          {user.lastLoginAt
            ? t('settings.users.lastLogin', {
                time: formatRelative(user.lastLoginAt, i18n.language),
              })
            : t('settings.users.neverLoggedIn')}
        </div>
      </div>

      {!isSelf && (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={t('settings.users.actions', { name: user.displayName })}
            className="flex size-8 shrink-0 cursor-default items-center justify-center rounded-lg text-text-secondary hover:bg-fill-hover hover:text-text data-[state=open]:bg-fill-selected pointer-coarse:size-11"
          >
            {update.isPending ? <Spinner /> : <Ellipsis className="size-4.5" />}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {user.role === 'admin' ? (
              <DropdownMenuItem icon={<ShieldOff />} onSelect={() => apply({ role: 'user' })}>
                {t('settings.users.removeAdmin')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem icon={<ShieldCheck />} onSelect={() => apply({ role: 'admin' })}>
                {t('settings.users.makeAdmin')}
              </DropdownMenuItem>
            )}
            {user.disabled ? (
              <DropdownMenuItem icon={<UserCheck />} onSelect={() => apply({ disabled: false })}>
                {t('settings.users.enable')}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem icon={<UserX />} onSelect={() => apply({ disabled: true })}>
                {t('settings.users.disable')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem icon={<KeyRound />} onSelect={() => setDialog('password')}>
              {t('settings.users.resetPassword')}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => setDialog('delete')}>
              {t('settings.users.delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        title={t('settings.users.deleteTitle', { name: user.displayName })}
        description={t('settings.users.deleteBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          try {
            await remove.mutateAsync(user.id)
            toast.success(t('settings.users.deleted'))
          } catch (error) {
            toast.error(errorMessage(error))
            throw error
          }
        }}
      />
      <ResetPasswordDialog
        user={user}
        open={dialog === 'password'}
        onOpenChange={(open) => setDialog(open ? 'password' : null)}
      />
    </div>
  )
}

const resetSchema = z.object({ password: passwordSchema })

function ResetPasswordDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUser
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const update = useAdminUpdateUser()
  const form = useForm({ resolver: zodResolver(resetSchema), defaultValues: { password: '' } })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ password }) => {
    try {
      await update.mutateAsync({ id: user.id, input: { password } })
      toast.success(t('settings.users.passwordReset'))
      form.reset()
      onOpenChange(false)
    } catch (error) {
      form.setError('root', { message: errorMessage(error) })
    }
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) form.reset()
        onOpenChange(next)
      }}
      title={t('settings.users.resetTitle', { name: user.displayName })}
      description={t('settings.users.resetBody')}
    >
      <form onSubmit={(event) => void onSubmit(event)} noValidate className="flex flex-col gap-4">
        {errors.root?.message && <Alert>{errors.root.message}</Alert>}
        <Field
          label={t('settings.account.newPassword')}
          description={t('auth.passwordHint')}
          error={errors.password?.message}
        >
          {(props) => (
            <PasswordInput {...props} {...form.register('password')} autoComplete="new-password" />
          )}
        </Field>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button type="submit" variant="primary" loading={isSubmitting}>
            {t('settings.users.resetSubmit')}
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
