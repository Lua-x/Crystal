import type { Backup, BackupStatus } from '@crystal/shared'
import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { DatabaseBackup, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { GroupedSection } from '../../components/ui/grouped'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { api } from '../../lib/api'
import { errorMessage } from '../../lib/errors'
import { formatBytes, formatDateTime } from '../../lib/format'
import { Page } from '../shell/page'
import { useSettingsBack } from './use-settings-back'

const backupsKey = ['admin', 'backups'] as const
const backupsQuery = queryOptions({
  queryKey: backupsKey,
  queryFn: () => api<BackupStatus>('/admin/backups'),
})

export function BackupsSettingsPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const status = useQuery(backupsQuery)
  const create = useMutation({
    mutationFn: () => api<Backup>('/admin/backups', { method: 'POST' }),
    onSuccess: () => toast.success(t('settings.backups.created')),
    onError: (error) => toast.error(errorMessage(error)),
    onSettled: () => queryClient.invalidateQueries({ queryKey: backupsKey }),
  })

  return (
    <Page
      title={t('settings.sections.backups')}
      backTo={useSettingsBack()}
      variant="grouped"
      actions={
        <Button variant="plain" loading={create.isPending} onClick={() => create.mutate()}>
          <DatabaseBackup aria-hidden />
          {t('settings.backups.create')}
        </Button>
      }
    >
      {status.isPending ? (
        <div className="flex justify-center py-10">
          <Spinner className="size-5" label={t('common.loading')} />
        </div>
      ) : status.isError ? (
        <Alert>{errorMessage(status.error)}</Alert>
      ) : (
        <div className="flex flex-col gap-6">
          <Alert tone="info">
            {status.data.intervalHours === 0
              ? t('settings.backups.off')
              : t('settings.backups.automatic', {
                  count: status.data.intervalHours,
                  retention: status.data.retention,
                })}
          </Alert>
          <GroupedSection
            title={t('settings.backups.title')}
            footer={
              <>
                {t('settings.backups.location', { directory: status.data.directory })}{' '}
                {t('settings.backups.secret')}
              </>
            }
          >
            {status.data.backups.length === 0 ? (
              <p className="px-4 py-3 text-callout text-text-secondary">
                {t('settings.backups.empty')}
              </p>
            ) : (
              status.data.backups.map((backup) => <BackupRow key={backup.name} backup={backup} />)
            )}
          </GroupedSection>
        </div>
      )}
    </Page>
  )
}

function BackupRow({ backup }: { backup: Backup }) {
  const { t, i18n } = useTranslation()
  return (
    <div className="flex items-center gap-3 px-4 py-2.5">
      <DatabaseBackup aria-hidden className="size-5 shrink-0 text-text-secondary" />
      <div className="min-w-0 flex-1">
        <div className="text-body">{formatDateTime(backup.createdAt, i18n.language)}</div>
        <div className="truncate text-footnote text-text-secondary">
          {backup.name} · {formatBytes(backup.size, i18n.language)}
        </div>
      </div>
      <a
        href={`/api/v1/admin/backups/${encodeURIComponent(backup.name)}`}
        download
        aria-label={t('settings.backups.download', { name: backup.name })}
        className="flex size-8 shrink-0 cursor-default items-center justify-center rounded-lg text-accent-text hover:bg-fill-hover pointer-coarse:size-11"
      >
        <Download aria-hidden className="size-4.5" />
      </a>
    </div>
  )
}
