import {
  IMPORT_FORMATS,
  IMPORT_MAX_CHARS,
  LIST_NAME_MAX_LENGTH,
  type ImportFormat,
  type ImportRequest,
  type ImportResult,
} from '@crystal/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Download, Upload } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Alert } from '../../components/ui/alert'
import { Button } from '../../components/ui/button'
import { Field } from '../../components/ui/field'
import { GroupedSection } from '../../components/ui/grouped'
import { Input } from '../../components/ui/input'
import { Select } from '../../components/ui/select'
import { inputClassName } from '../../components/ui/styles'
import { api, ApiError } from '../../lib/api'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { Page } from '../shell/page'
import { refreshTaskData } from '../tasks/data'
import { useSettingsBack } from './use-settings-back'

const ACCEPT: Record<ImportFormat, string> = {
  crystal: '.json,application/json',
  todoist: '.csv,text/csv',
  outlook: '.csv,text/csv',
}

export function TransferSettingsPage() {
  const { t } = useTranslation()
  return (
    <Page title={t('settings.sections.transfer')} backTo={useSettingsBack()} variant="grouped">
      <div className="flex flex-col gap-8">
        <GroupedSection title={t('settings.transfer.export')}>
          <div className="flex flex-col items-start gap-3 p-4">
            <p className="text-callout text-text-secondary">{t('settings.transfer.exportHint')}</p>
            <Button asChild variant="secondary">
              <a href="/api/v1/export" download>
                <Download aria-hidden />
                {t('settings.transfer.download')}
              </a>
            </Button>
          </div>
        </GroupedSection>
        <ImportSection />
      </div>
    </Page>
  )
}

function ImportSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileId = useId()
  const helpId = useId()
  const [format, setFormat] = useState<ImportFormat>('crystal')
  const [file, setFile] = useState<File | null>(null)
  const [listName, setListName] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<{ message: string; detail?: string } | null>(null)
  const csv = format !== 'crystal'

  const importFile = useMutation({
    mutationFn: (input: ImportRequest) =>
      api<ImportResult>('/import', { method: 'POST', body: input }),
    onSettled: () => refreshTaskData(queryClient),
  })

  const submit = async () => {
    if (!file) return
    setResult(null)
    setError(null)
    const content = await file.text()
    if (content.length > IMPORT_MAX_CHARS) {
      setError({ message: t('settings.transfer.tooLarge') })
      return
    }
    try {
      setResult(
        await importFile.mutateAsync({
          format,
          content,
          ...(csv ? { listName: listName.trim() || nameFromFile(file.name) } : {}),
        }),
      )
    } catch (caught) {
      setError({
        message: errorMessage(caught),
        // The server says why in English; still more helpful than nothing.
        detail:
          caught instanceof ApiError && caught.code === 'import_invalid'
            ? caught.message
            : undefined,
      })
    }
  }

  return (
    <GroupedSection
      title={t('settings.transfer.import')}
      footer={t('settings.transfer.importHint')}
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
        className="flex flex-col gap-4 p-4"
      >
        <Field label={t('settings.transfer.source')}>
          {(props) => (
            <Select
              {...props}
              value={format}
              aria-describedby={helpId}
              onChange={(event) => {
                setFormat(event.target.value as ImportFormat)
                setResult(null)
                setError(null)
              }}
            >
              {IMPORT_FORMATS.map((option) => (
                <option key={option} value={option}>
                  {t(`settings.transfer.sources.${option}`)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <p id={helpId} className="-mt-2 text-footnote text-text-secondary">
          {t(`settings.transfer.help.${format}`)}
        </p>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={fileId} className="text-subhead font-medium">
            {t('settings.transfer.file')}
          </label>
          <input
            id={fileId}
            type="file"
            accept={ACCEPT[format]}
            onChange={(event) => {
              const chosen = event.target.files?.[0] ?? null
              setFile(chosen)
              setResult(null)
              setError(null)
              if (chosen && !listName) setListName(nameFromFile(chosen.name))
            }}
            className={cn(
              inputClassName,
              'h-auto py-1.5 text-callout file:mr-3 file:rounded-md file:border-0 file:bg-fill-control file:px-2.5 file:py-1 file:text-subhead file:font-medium file:text-text',
            )}
          />
        </div>
        {csv && (
          <Field label={t('settings.transfer.listName')}>
            {(props) => (
              <Input
                {...props}
                value={listName}
                maxLength={LIST_NAME_MAX_LENGTH}
                onChange={(event) => setListName(event.target.value)}
              />
            )}
          </Field>
        )}
        {error && (
          <Alert>
            {error.message}
            {error.detail && <span className="mt-1 block text-footnote">{error.detail}</span>}
          </Alert>
        )}
        {result && (
          <Alert tone="success">
            {t('settings.transfer.done', { count: result.lists, tasks: result.tasks })}
          </Alert>
        )}
        <div>
          <Button type="submit" variant="primary" disabled={!file} loading={importFile.isPending}>
            <Upload aria-hidden />
            {t('settings.transfer.submit')}
          </Button>
        </div>
      </form>
    </GroupedSection>
  )
}

/** `Groceries.csv` → `Groceries` */
function nameFromFile(name: string): string {
  return name.replace(/\.[^.]+$/, '').slice(0, LIST_NAME_MAX_LENGTH) || 'Import'
}
