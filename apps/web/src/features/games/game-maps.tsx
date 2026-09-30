import { IMAGE_TYPES, type List } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { ImagePlus, Map as MapIcon, Plus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { errorMessage } from '../../lib/errors'
import { mapsQuery, useAddMap } from './map-data'

/** The maps of a game, and a way to add one. */
export function GameMaps({ list }: { list: List }) {
  const { t } = useTranslation()
  const maps = useQuery(mapsQuery(list.id))
  const [adding, setAdding] = useState(false)
  const canEdit = list.role !== 'viewer'
  if (!maps.data || (maps.data.length === 0 && !canEdit)) return null

  return (
    <nav aria-label={t('maps.title')} className="flex flex-wrap items-center gap-2 px-1">
      {maps.data.map((map) => (
        <Link
          key={map.id}
          to="/lists/$listId/maps/$mapId"
          params={{ listId: list.id, mapId: map.id }}
          aria-label={t('maps.open', { name: map.name })}
          className="flex h-8 max-w-60 cursor-default items-center gap-1.5 rounded-full bg-fill-control px-3 text-subhead font-medium hover:bg-fill-pressed pointer-coarse:h-11"
        >
          <MapIcon aria-hidden className="size-4 shrink-0 text-accent-text" />
          <span className="truncate">{map.name}</span>
        </Link>
      ))}
      {canEdit && (
        <Button size="sm" variant="plain" onClick={() => setAdding(true)}>
          <Plus aria-hidden />
          {t('maps.add')}
        </Button>
      )}
      <Dialog open={adding} onOpenChange={setAdding} title={t('maps.addTitle')}>
        {adding && <AddMapForm list={list} onDone={() => setAdding(false)} />}
      </Dialog>
    </nav>
  )
}

function AddMapForm({ list, onDone }: { list: List; onDone: () => void }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const add = useAddMap()
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | undefined>()
  const [fileError, setFileError] = useState<string | undefined>()

  useEffect(() => {
    if (!preview) return
    return () => URL.revokeObjectURL(preview)
  }, [preview])

  const pick = (picked: File | undefined) => {
    if (!picked) return
    if (!(IMAGE_TYPES as readonly string[]).includes(picked.type)) {
      setFileError(t('maps.unsupported'))
      return
    }
    setFileError(undefined)
    setFile(picked)
    setPreview(URL.createObjectURL(picked))
    // A picture called "hallownest.png" suggests the name.
    if (!name.trim())
      setName(
        picked.name
          .replace(/\.[^.]+$/, '')
          .replace(/[_-]+/g, ' ')
          .trim(),
      )
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) setNameError('validation.required')
    if (!file) setFileError(t('maps.unsupported'))
    if (!trimmed || !file) return
    add.mutate(
      { listId: list.id, name: trimmed, file },
      {
        onSuccess: (map) => {
          onDone()
          void navigate({
            to: '/lists/$listId/maps/$mapId',
            params: { listId: list.id, mapId: map.id },
          })
        },
        onError: (error) => setFileError(t('maps.failed', { reason: errorMessage(error) })),
      },
    )
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <span id="map-picture-label" className="text-subhead font-medium">
          {t('maps.picture')}
        </span>
        <div className="flex items-center gap-3">
          <div className="flex aspect-video w-36 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-fill-control text-text-secondary">
            {preview ? (
              <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <ImagePlus aria-hidden className="size-6" />
            )}
          </div>
          <Button
            size="sm"
            aria-describedby="map-picture-hint"
            onClick={() => inputRef.current?.click()}
          >
            {file ? t('maps.change') : t('maps.choose')}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept={IMAGE_TYPES.join(',')}
            tabIndex={-1}
            aria-hidden
            className="hidden"
            onChange={(event) => {
              pick(event.target.files?.[0])
              event.target.value = ''
            }}
          />
        </div>
        {fileError ? (
          <p id="map-picture-hint" role="alert" className="text-footnote text-danger">
            {fileError}
          </p>
        ) : (
          <p id="map-picture-hint" className="text-footnote text-text-secondary">
            {t('maps.pictureHint')}
          </p>
        )}
      </div>
      <Field label={t('maps.name')} error={nameError}>
        {(props) => (
          <Input
            {...props}
            value={name}
            maxLength={100}
            placeholder={t('maps.namePlaceholder')}
            onChange={(event) => {
              setName(event.target.value)
              setNameError(undefined)
            }}
          />
        )}
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onDone}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" loading={add.isPending}>
          {t('maps.add')}
        </Button>
      </div>
    </form>
  )
}
