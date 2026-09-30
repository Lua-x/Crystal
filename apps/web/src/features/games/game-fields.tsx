import { COVER_MAX_BYTES, IMAGE_TYPES } from '@crystal/shared'
import { ImagePlus, X } from 'lucide-react'
import { useEffect, useId, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Field } from '../../components/ui/field'
import { IconButton } from '../../components/ui/icon-button'
import { Input } from '../../components/ui/input'
import { GameCover } from './game-cover'

/** What should happen to the cover when the dialog is saved. */
export type CoverDraft =
  { kind: 'keep' } | { kind: 'set'; file: File; preview: string } | { kind: 'remove' }

/** Picks a new cover picture, shown as a preview until the dialog is saved. */
export function CoverField({
  currentId,
  draft,
  error,
  onChange,
  onError,
}: {
  /** The cover the game has now. */
  currentId: string | null
  draft: CoverDraft
  error: string | undefined
  onChange: (draft: CoverDraft) => void
  onError: (message: string | undefined) => void
}) {
  const { t } = useTranslation()
  const inputRef = useRef<HTMLInputElement>(null)
  const labelId = useId()
  const hintId = useId()
  const errorId = useId()

  // Previews are object URLs; each one is released once it is no longer shown.
  const preview = draft.kind === 'set' ? draft.preview : null
  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const shownId = draft.kind === 'keep' ? currentId : null
  const hasCover = preview !== null || shownId !== null

  const pick = (file: File | undefined) => {
    if (!file) return
    if (!(IMAGE_TYPES as readonly string[]).includes(file.type)) {
      onError(t('games.coverUnsupported'))
      return
    }
    if (file.size > COVER_MAX_BYTES) {
      onError(t('games.coverTooLarge'))
      return
    }
    onError(undefined)
    onChange({ kind: 'set', file, preview: URL.createObjectURL(file) })
  }

  return (
    <div className="flex flex-col gap-1.5" role="group" aria-labelledby={labelId}>
      <span id={labelId} className="text-subhead font-medium">
        {t('games.cover')}
        <span className="font-regular text-text-secondary"> ({t('common.optional')})</span>
      </span>
      <div className="flex items-center gap-3">
        <div className="aspect-[460/215] w-36 shrink-0 overflow-hidden rounded-xl bg-fill-control">
          {preview ? (
            <img src={preview} alt="" className="size-full object-cover" />
          ) : shownId ? (
            <GameCover imageId={shownId} className="size-full" />
          ) : (
            <span className="flex size-full items-center justify-center text-text-secondary">
              <ImagePlus aria-hidden className="size-6" />
            </span>
          )}
        </div>
        <div className="flex flex-col items-start gap-1">
          <Button
            size="sm"
            aria-describedby={error ? errorId : hintId}
            onClick={() => inputRef.current?.click()}
          >
            {hasCover ? t('games.changeCover') : t('games.chooseCover')}
          </Button>
          {hasCover && (
            <Button
              size="sm"
              variant="plain"
              onClick={() => {
                onError(undefined)
                onChange(currentId ? { kind: 'remove' } : { kind: 'keep' })
              }}
            >
              {t('games.removeCover')}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={IMAGE_TYPES.join(',')}
          tabIndex={-1}
          aria-hidden
          className="hidden"
          onChange={(event) => {
            pick(event.target.files?.[0])
            // Choosing the same file again should work, too.
            event.target.value = ''
          }}
        />
      </div>
      {error ? (
        <p id={errorId} role="alert" className="text-footnote text-danger">
          {error}
        </p>
      ) : (
        <p id={hintId} className="text-footnote text-text-secondary">
          {t('games.coverHint')}
        </p>
      )}
    </div>
  )
}

/** The day a game should be finished by. */
export function DeadlineField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (value: string | null) => void
}) {
  const { t } = useTranslation()
  return (
    <Field label={t('games.deadlineLabel')} description={t('games.deadlineHint')} optional>
      {(props) => (
        <div className="flex items-center gap-2">
          <Input
            {...props}
            type="date"
            value={value ?? ''}
            onChange={(event) => onChange(event.target.value || null)}
            className="min-w-0 flex-1"
          />
          {value && (
            <IconButton label={t('games.removeDeadline')} onClick={() => onChange(null)}>
              <X />
            </IconButton>
          )}
        </div>
      )}
    </Field>
  )
}
