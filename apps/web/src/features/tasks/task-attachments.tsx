import { PREVIEWABLE_IMAGE_TYPES, type Attachment, type Task } from '@crystal/shared'
import { FileImage, FileText, Paperclip, Plus, X } from 'lucide-react'
import { useId, useRef, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Spinner } from '../../components/ui/spinner'
import { toast } from '../../components/ui/toast-store'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { formatBytes } from '../../lib/format'
import { useDeleteAttachment, useUploadAttachment } from './data'

const ACCEPT =
  'image/png,image/jpeg,image/gif,image/webp,image/avif,image/heic,.heic,application/pdf'

const fileUrl = (attachment: Attachment) => `/api/v1/attachments/${attachment.id}`

/** Images and PDFs of a task: thumbnails, adding by button or by dropping files. */
export function TaskAttachments({ task, disabled }: { task: Task; disabled: boolean }) {
  const { t } = useTranslation()
  const upload = useUploadAttachment()
  const input = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const [pending, setPending] = useState(0)
  const [dragging, setDragging] = useState(false)

  if (disabled && task.attachments.length === 0) return null

  const addFiles = async (files: readonly File[]) => {
    for (const file of files) {
      setPending((count) => count + 1)
      try {
        await upload.mutateAsync({ taskId: task.id, file })
      } catch (error) {
        toast.error(t('attachments.failed', { name: file.name, reason: errorMessage(error) }))
      } finally {
        setPending((count) => count - 1)
      }
    }
  }

  const dropHandlers = disabled
    ? {}
    : {
        onDragOver: (event: DragEvent) => {
          if (!event.dataTransfer.types.includes('Files')) return
          event.preventDefault()
          setDragging(true)
        },
        onDragLeave: (event: DragEvent) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false)
        },
        onDrop: (event: DragEvent) => {
          event.preventDefault()
          setDragging(false)
          void addFiles([...event.dataTransfer.files])
        },
      }

  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'relative mt-5 rounded-xl transition-colors',
        dragging && 'bg-accent-soft outline-2 outline-offset-4 outline-accent-text outline-dashed',
      )}
      {...dropHandlers}
    >
      <h3
        id={headingId}
        className="flex items-center gap-1.5 px-1 pb-2 text-footnote font-semibold text-text-secondary"
      >
        <Paperclip aria-hidden className="size-3.5" />
        {t('attachments.title')}
      </h3>
      {task.attachments.length > 0 && (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {task.attachments.map((attachment) => (
            <AttachmentItem
              key={attachment.id}
              taskId={task.id}
              attachment={attachment}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
      {!disabled && (
        <div className="mt-2 flex items-center gap-3">
          <Button variant="plain" size="sm" onClick={() => input.current?.click()}>
            <Plus aria-hidden />
            {t('attachments.add')}
          </Button>
          {pending > 0 && <Spinner className="size-4" label={t('attachments.uploading')} />}
          <span className="text-footnote text-text-secondary pointer-coarse:hidden">
            {t('attachments.dropHint')}
          </span>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            hidden
            onChange={(event) => {
              const files = [...(event.target.files ?? [])]
              event.target.value = ''
              void addFiles(files)
            }}
          />
        </div>
      )}
    </section>
  )
}

function AttachmentItem({
  taskId,
  attachment,
  disabled,
}: {
  taskId: string
  attachment: Attachment
  disabled: boolean
}) {
  const { t, i18n } = useTranslation()
  const remove = useDeleteAttachment()
  const previewable = PREVIEWABLE_IMAGE_TYPES.includes(attachment.mimeType)
  const Icon = attachment.mimeType === 'application/pdf' ? FileText : FileImage

  return (
    <li className="group/file relative overflow-hidden rounded-xl bg-cell shadow-sm">
      <a
        href={previewable ? fileUrl(attachment) : `${fileUrl(attachment)}?download=1`}
        target={previewable ? '_blank' : undefined}
        rel="noopener"
        download={previewable ? undefined : attachment.fileName}
        className="block cursor-default focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
      >
        {previewable ? (
          <img
            src={fileUrl(attachment)}
            alt=""
            loading="lazy"
            className="aspect-[4/3] w-full bg-fill-control object-cover"
          />
        ) : (
          <span className="flex aspect-[4/3] w-full items-center justify-center bg-fill-control text-text-secondary">
            <Icon aria-hidden className="size-8" />
          </span>
        )}
        <span className="block px-2.5 py-1.5">
          <span className="block truncate text-footnote font-medium">{attachment.fileName}</span>
          <span className="block text-caption text-text-secondary">
            {formatBytes(attachment.size, i18n.language)}
          </span>
        </span>
      </a>
      {!disabled && (
        <button
          type="button"
          aria-label={t('attachments.remove', { name: attachment.fileName })}
          onClick={() => remove.mutate({ taskId, id: attachment.id })}
          className="backdrop-blur absolute top-1.5 right-1.5 flex size-7 cursor-default items-center justify-center rounded-full bg-elevated/90 text-text-secondary shadow-sm hover:text-text focus-visible:opacity-100 md:opacity-0 md:group-hover/file:opacity-100 pointer-coarse:size-9"
        >
          <X aria-hidden className="size-4" />
        </button>
      )}
    </li>
  )
}
