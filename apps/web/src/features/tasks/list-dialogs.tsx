import { LIST_COLORS, type List, type ListColor } from '@crystal/shared'
import { useNavigate } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { Dialog } from '../../components/ui/dialog'
import { Field } from '../../components/ui/field'
import { Input } from '../../components/ui/input'
import { cn } from '../../lib/cn'
import { useCreateGroup, useCreateList, useUpdateGroup, useUpdateList } from './data'
import { LIST_BG_CLASS } from './list-colors'

/** A small set of emoji that work well as list icons. */
const EMOJI = [
  '📋',
  '🏠',
  '🛒',
  '🍎',
  '🧹',
  '🧺',
  '🌱',
  '🐾',
  '🎁',
  '🎂',
  '✈️',
  '🏖️',
  '🚗',
  '🚲',
  '💼',
  '📚',
  '🎓',
  '💡',
  '💰',
  '🧾',
  '❤️',
  '👶',
  '🏋️',
  '🎮',
  '🎵',
  '🎨',
  '🔧',
  '💊',
  '📞',
  '⭐',
]

interface ListDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Edit this list; without it, a new list is created. */
  list?: List
  groupId?: string | null
  /** Called after a new list was created and opened (e.g. to close the drawer). */
  onCreated?: (() => void) | undefined
}

export function ListDialog({
  open,
  onOpenChange,
  list,
  groupId = null,
  onCreated,
}: ListDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={list ? t('lists.editListTitle') : t('lists.newListTitle')}
    >
      {open && (
        <ListForm
          list={list}
          groupId={groupId}
          onDone={() => onOpenChange(false)}
          onCreated={onCreated}
        />
      )}
    </Dialog>
  )
}

function ListForm({
  list,
  groupId,
  onDone,
  onCreated,
}: {
  list: List | undefined
  groupId: string | null
  onDone: () => void
  onCreated: (() => void) | undefined
}) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const create = useCreateList()
  const update = useUpdateList()
  const [name, setName] = useState(list?.name ?? '')
  const [color, setColor] = useState<ListColor>(list?.color ?? 'blue')
  const [icon, setIcon] = useState<string | null>(list?.icon ?? null)
  const [error, setError] = useState<string | undefined>()

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('validation.required')
      return
    }
    if (list) {
      update.mutate({ id: list.id, input: { name: trimmed, color, icon } })
      onDone()
      return
    }
    // A new list opens right away, so the dialog waits for its id.
    const created = await create
      .mutateAsync({ name: trimmed, color, icon, groupId })
      .catch(() => null) // The mutation shows the error; the dialog stays open.
    if (!created) return
    onDone()
    onCreated?.()
    await navigate({ to: '/lists/$listId', params: { listId: created.id } })
  }

  return (
    <form onSubmit={(event) => void submit(event)} noValidate className="flex flex-col gap-5">
      <Field label={t('lists.name')} error={error}>
        {(props) => (
          <Input
            {...props}
            value={name}
            maxLength={100}
            placeholder={t('lists.namePlaceholder')}
            onChange={(event) => {
              setName(event.target.value)
              setError(undefined)
            }}
          />
        )}
      </Field>

      <div className="flex flex-col gap-2">
        <span id="list-color-label" className="text-subhead font-medium">
          {t('lists.color')}
        </span>
        <RadioGroup.Root
          aria-labelledby="list-color-label"
          value={color}
          onValueChange={(value) => setColor(value as ListColor)}
          orientation="horizontal"
          loop
          className="grid grid-cols-6 gap-2"
        >
          {LIST_COLORS.map((value) => (
            <RadioGroup.Item
              key={value}
              value={value}
              aria-label={t(`lists.colors.${value}`)}
              title={t(`lists.colors.${value}`)}
              className={cn(
                'flex size-9 cursor-default items-center justify-center justify-self-center rounded-full transition-transform hover:scale-105',
                'data-[state=checked]:ring-2 data-[state=checked]:ring-text-secondary data-[state=checked]:ring-offset-2 data-[state=checked]:ring-offset-elevated',
                LIST_BG_CLASS[value],
              )}
            >
              <RadioGroup.Indicator>
                <Check aria-hidden className="size-4 text-knob" strokeWidth={3} />
              </RadioGroup.Indicator>
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
      </div>

      <div className="flex flex-col gap-2">
        <span id="list-icon-label" className="text-subhead font-medium">
          {t('lists.icon')}
        </span>
        <RadioGroup.Root
          aria-labelledby="list-icon-label"
          aria-describedby="list-icon-hint"
          value={icon ?? ''}
          onValueChange={(value) => setIcon(value || null)}
          orientation="horizontal"
          loop
          className="grid grid-cols-8 gap-1"
        >
          <RadioGroup.Item
            value=""
            aria-label={t('lists.noIcon')}
            title={t('lists.noIcon')}
            className="flex size-9 cursor-default items-center justify-center justify-self-center rounded-lg hover:bg-fill-hover data-[state=checked]:bg-accent-soft"
          >
            <span aria-hidden className={cn('size-2.5 rounded-full', LIST_BG_CLASS[color])} />
          </RadioGroup.Item>
          {EMOJI.map((emoji) => (
            <RadioGroup.Item
              key={emoji}
              value={emoji}
              aria-label={emoji}
              className="flex size-9 cursor-default items-center justify-center justify-self-center rounded-lg text-title3 hover:bg-fill-hover data-[state=checked]:bg-accent-soft"
            >
              {emoji}
            </RadioGroup.Item>
          ))}
        </RadioGroup.Root>
        <p id="list-icon-hint" className="text-footnote text-text-secondary">
          {t('lists.iconHint')}
        </p>
      </div>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onDone}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary" loading={create.isPending}>
          {list ? t('common.save') : t('common.create')}
        </Button>
      </div>
    </form>
  )
}

interface GroupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group?: { id: string; name: string }
}

export function GroupDialog({ open, onOpenChange, group }: GroupDialogProps) {
  const { t } = useTranslation()
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={group ? t('lists.renameGroupTitle') : t('lists.newGroup')}
    >
      {open && <GroupForm group={group} onDone={() => onOpenChange(false)} />}
    </Dialog>
  )
}

function GroupForm({
  group,
  onDone,
}: {
  group: { id: string; name: string } | undefined
  onDone: () => void
}) {
  const { t } = useTranslation()
  const create = useCreateGroup()
  const update = useUpdateGroup()
  const [name, setName] = useState(group?.name ?? '')
  const [error, setError] = useState<string | undefined>()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('validation.required')
      return
    }
    if (group) update.mutate({ id: group.id, input: { name: trimmed } })
    else create.mutate({ name: trimmed })
    onDone()
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label={t('lists.groupName')} error={error}>
        {(props) => (
          <Input
            {...props}
            value={name}
            maxLength={100}
            onChange={(event) => {
              setName(event.target.value)
              setError(undefined)
            }}
          />
        )}
      </Field>
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button onClick={onDone}>{t('common.cancel')}</Button>
        <Button type="submit" variant="primary">
          {group ? t('common.save') : t('common.create')}
        </Button>
      </div>
    </form>
  )
}
