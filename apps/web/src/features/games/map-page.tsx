import type { GameMap, List, Task } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link, useNavigate } from '@tanstack/react-router'
import {
  ChevronLeft,
  Crosshair,
  Ellipsis,
  MapPinned,
  Pencil,
  SearchX,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'

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
import { EmptyState } from '../../components/ui/empty-state'
import { Field } from '../../components/ui/field'
import { IconButton } from '../../components/ui/icon-button'
import { Input } from '../../components/ui/input'
import { Spinner } from '../../components/ui/spinner'
import { Switch } from '../../components/ui/switch'
import { TaskCheckbox } from '../../components/ui/task-checkbox'
import { toast } from '../../components/ui/toast-store'
import { cn } from '../../lib/cn'
import { useDocumentTitle } from '../../lib/document-title'
import { errorMessage } from '../../lib/errors'
import { listsQuery, listTasksQuery } from '../tasks/data'
import { useTaskSelection } from '../tasks/hooks'
import { useTaskActions, type TaskActions } from '../tasks/task-actions'
import { byPosition } from '../tasks/view-logic'
import { imageUrl } from './game-logic'
import { mapsQuery, useDeleteMap, useRenameMap } from './map-data'
import { MapViewer, type MapPinView } from './map-viewer'

const route = getRouteApi('/_app/lists/$listId/maps/$mapId')

export function MapPage() {
  const { t } = useTranslation()
  const { listId, mapId } = route.useParams()
  const lists = useQuery(listsQuery)
  const maps = useQuery(mapsQuery(listId))
  const list = lists.data?.find((item) => item.id === listId)
  const map = maps.data?.find((item) => item.id === mapId)
  useDocumentTitle(map?.name ?? t('maps.title'))

  if (!list || !map) {
    const pending = lists.isPending || maps.isPending
    return (
      <div className="flex h-full items-center justify-center">
        {pending ? (
          <Spinner className="size-6" label={t('common.loading')} />
        ) : (
          <EmptyState icon={<SearchX />} title={t('maps.notFound')} />
        )}
      </div>
    )
  }
  return <MapScreen list={list} map={map} maps={maps.data ?? []} />
}

function MapScreen({ list, map, maps }: { list: List; map: GameMap; maps: GameMap[] }) {
  const { t } = useTranslation()
  const tasksQuery = useQuery(listTasksQuery(list.id))
  const actions = useTaskActions()
  const selection = useTaskSelection()
  const canEdit = list.role !== 'viewer'
  const [placingId, setPlacingId] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focus, setFocus] = useState<{ id: string; nonce: number } | null>(null)
  const [showCompleted, setShowCompleted] = useState(false)
  // The new pin is visible; screen readers hear about it here (a toast would cover the map).
  const [announcement, setAnnouncement] = useState('')

  const goals = (tasksQuery.data ?? []).filter((task) => task.listId === list.id).sort(byPosition)
  const shown = goals.filter((task) => showCompleted || !task.completedAt)
  const pins: MapPinView[] = shown.flatMap((task) =>
    task.pin?.mapId === map.id
      ? [
          {
            id: task.id,
            x: task.pin.x,
            y: task.pin.y,
            title: task.title,
            completed: !!task.completedAt,
          },
        ]
      : [],
  )
  const placing = goals.find((task) => task.id === placingId)
  const selected = goals.find((task) => task.id === selectedId && task.pin?.mapId === map.id)

  // Escape cancels placing a pin.
  useEffect(() => {
    if (!placing) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setPlacingId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [placing])

  const place = (x: number, y: number) => {
    if (!placing) return
    actions.update({ id: placing.id, input: { pin: { mapId: map.id, x, y } } })
    setAnnouncement(t('maps.placed', { title: placing.title }))
    setSelectedId(placing.id)
    setPlacingId(null)
  }

  const show = (task: Task) => {
    setSelectedId(task.id)
    setFocus((previous) => ({ id: task.id, nonce: (previous?.nonce ?? 0) + 1 }))
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto lg:overflow-hidden">
      <header className="sticky top-0 z-10 flex h-13 shrink-0 items-center gap-1 px-2 pt-[env(safe-area-inset-top)] hairline-b material-bar">
        <Link
          to="/lists/$listId"
          params={{ listId: list.id }}
          className="flex h-8 max-w-48 shrink-0 cursor-default items-center gap-0.5 rounded-lg pr-2.5 pl-1 text-callout text-accent-text hover:bg-fill-hover pointer-coarse:h-11"
          aria-label={t('maps.back', { game: list.name })}
        >
          <ChevronLeft aria-hidden className="size-5 shrink-0" />
          <span className="truncate">{list.name}</span>
        </Link>
        <h1 className="text-headline min-w-0 flex-1 truncate px-2 font-semibold">{map.name}</h1>
        {canEdit && <MapMenu map={map} list={list} />}
      </header>

      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[65vh] shrink-0 lg:h-auto lg:min-h-0 lg:flex-1">
          <MapViewer
            imageUrl={imageUrl(map.imageId)}
            name={map.name}
            width={map.width}
            height={map.height}
            pins={pins}
            selectedId={selected?.id ?? null}
            placing={placing !== undefined}
            onPlace={place}
            onSelect={setSelectedId}
            focus={focus}
          />
          {placing && (
            <div
              role="status"
              className="absolute inset-x-3 top-3 flex items-start gap-3 rounded-xl bg-elevated p-3 shadow-lg"
            >
              <Crosshair aria-hidden className="mt-0.5 size-5 shrink-0 text-accent-text" />
              <div className="min-w-0 flex-1">
                <p className="text-callout font-medium">
                  {t('maps.placeTitle', { title: placing.title })}
                </p>
                <p className="text-footnote text-text-secondary">{t('maps.placeHint')}</p>
              </div>
              <Button size="sm" onClick={() => setPlacingId(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}
          {selected && !placing && (
            <SelectedGoal
              task={selected}
              canEdit={canEdit}
              actions={actions}
              onMove={() => setPlacingId(selected.id)}
              onRemove={() => {
                actions.update({ id: selected.id, input: { pin: null } })
                setSelectedId(null)
              }}
              onDetails={() => selection.open(selected.id)}
              onClose={() => setSelectedId(null)}
            />
          )}
        </div>

        <aside
          aria-label={t('maps.goals')}
          className="flex shrink-0 flex-col bg-canvas lg:w-80 lg:overflow-y-auto lg:hairline-l"
        >
          <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
            <h2 className="text-headline font-semibold">{t('maps.goals')}</h2>
            <label className="flex items-center gap-2 text-footnote text-text-secondary">
              {t('maps.showCompleted')}
              <Switch checked={showCompleted} onCheckedChange={setShowCompleted} />
            </label>
          </div>
          {tasksQuery.isPending ? (
            <div className="flex justify-center py-6">
              <Spinner label={t('common.loading')} />
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              className="py-8"
              icon={<MapPinned />}
              title={t('maps.empty')}
              body={t('maps.emptyBody')}
            />
          ) : (
            <ul className="flex flex-col px-2 pb-6">
              {shown.map((task) => (
                <GoalItem
                  key={task.id}
                  task={task}
                  map={map}
                  maps={maps}
                  canEdit={canEdit}
                  placing={task.id === placingId}
                  selected={task.id === selected?.id}
                  onPlace={() => {
                    setSelectedId(null)
                    setPlacingId(task.id)
                  }}
                  onShow={() => show(task)}
                />
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  )
}

function GoalItem({
  task,
  map,
  maps,
  canEdit,
  placing,
  selected,
  onPlace,
  onShow,
}: {
  task: Task
  map: GameMap
  maps: GameMap[]
  canEdit: boolean
  placing: boolean
  selected: boolean
  onPlace: () => void
  onShow: () => void
}) {
  const { t } = useTranslation()
  const here = task.pin?.mapId === map.id
  const elsewhere = task.pin && !here ? maps.find((item) => item.id === task.pin?.mapId) : undefined
  const where = here
    ? t('maps.onThisMap')
    : elsewhere
      ? t('maps.onOtherMap', { map: elsewhere.name })
      : t('maps.notOnMap')

  return (
    <li
      className={cn(
        'flex min-h-12 items-center gap-2 rounded-lg px-2 py-1.5',
        (selected || placing) && 'bg-accent-soft',
      )}
    >
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            'truncate text-callout',
            task.completedAt && 'text-text-secondary line-through',
          )}
        >
          {task.title}
        </p>
        <p className="text-footnote text-text-secondary">{where}</p>
      </div>
      {here ? (
        <IconButton label={t('maps.show', { title: task.title })} onClick={onShow}>
          <Crosshair />
        </IconButton>
      ) : (
        canEdit && (
          <Button
            size="sm"
            aria-label={t('maps.placeGoal', { title: task.title })}
            aria-pressed={placing}
            onClick={onPlace}
          >
            {t('maps.place')}
          </Button>
        )
      )}
    </li>
  )
}

/** The pin someone picked: complete the goal, move or remove the pin, or open the details. */
function SelectedGoal({
  task,
  canEdit,
  actions,
  onMove,
  onRemove,
  onDetails,
  onClose,
}: {
  task: Task
  canEdit: boolean
  actions: TaskActions
  onMove: () => void
  onRemove: () => void
  onDetails: () => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const completed = task.completedAt !== null
  return (
    <div className="absolute inset-x-3 bottom-3 flex flex-col gap-2 rounded-xl bg-elevated p-3 shadow-lg sm:right-auto sm:max-w-sm">
      <div className="flex items-start gap-2">
        <TaskCheckbox
          checked={completed}
          disabled={!canEdit}
          onCheckedChange={(checked) => actions.toggleComplete(task, checked)}
          label={
            completed
              ? t('tasks.reopen', { title: task.title })
              : t('tasks.complete', { title: task.title })
          }
        />
        <p
          className={cn(
            'min-w-0 flex-1 pt-1 text-callout font-medium',
            completed && 'text-text-secondary line-through',
          )}
        >
          {task.title}
        </p>
        <IconButton label={t('common.close')} onClick={onClose}>
          <X />
        </IconButton>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={onDetails}>
          {t('maps.details')}
        </Button>
        {canEdit && (
          <>
            <Button size="sm" onClick={onMove}>
              {t('maps.move')}
            </Button>
            <Button size="sm" variant="destructive-plain" onClick={onRemove}>
              {t('maps.removePin')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}

function MapMenu({ map, list }: { map: GameMap; list: List }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const remove = useDeleteMap()
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t('maps.actions', { name: map.name })}
          className="flex size-8 cursor-default items-center justify-center rounded-lg text-text-secondary hover:bg-fill-hover hover:text-text data-[state=open]:bg-fill-selected pointer-coarse:size-11"
        >
          <Ellipsis aria-hidden className="size-4.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem icon={<Pencil />} onSelect={() => setDialog('rename')}>
            {t('maps.rename')}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<Trash2 />} destructive onSelect={() => setDialog('delete')}>
            {t('maps.delete')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog
        open={dialog === 'rename'}
        onOpenChange={(open) => setDialog(open ? 'rename' : null)}
        title={t('maps.renameTitle')}
      >
        {dialog === 'rename' && <RenameForm map={map} onDone={() => setDialog(null)} />}
      </Dialog>
      <ConfirmDialog
        open={dialog === 'delete'}
        onOpenChange={(open) => setDialog(open ? 'delete' : null)}
        title={t('maps.deleteTitle', { name: map.name })}
        description={t('maps.deleteBody')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={() =>
          remove.mutate(map, {
            onSuccess: () => {
              toast({ title: t('maps.deleted') })
              void navigate({ to: '/lists/$listId', params: { listId: list.id } })
            },
            onError: (error) => toast.error(errorMessage(error)),
          })
        }
      />
    </>
  )
}

function RenameForm({ map, onDone }: { map: GameMap; onDone: () => void }) {
  const { t } = useTranslation()
  const rename = useRenameMap()
  const [name, setName] = useState(map.name)
  const [error, setError] = useState<string | undefined>()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) {
      setError('validation.required')
      return
    }
    rename.mutate(
      { map, input: { name: name.trim() } },
      { onSuccess: onDone, onError: (failure) => setError(errorMessage(failure)) },
    )
  }
  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      <Field label={t('maps.name')} error={error}>
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
        <Button type="submit" variant="primary" loading={rename.isPending}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  )
}
