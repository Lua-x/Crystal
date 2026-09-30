import { parseQuickEntry, SMART_VIEWS, type Locale, type SmartView } from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Command } from 'cmdk'
import {
  CalendarClock,
  CalendarDays,
  ChartColumn,
  CircleCheck,
  FolderPlus,
  Hash,
  Inbox,
  Keyboard,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Search,
  Settings,
  Star,
  Sun,
  SunMedium,
  UserCheck,
} from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { toast } from '../../components/ui/toast-store'
import { springs } from '../../lib/motion'
import { useLogout, useUpdateMe } from '../../lib/queries'
import {
  groupsQuery,
  listsQuery,
  newTaskId,
  searchQuery,
  tagsQuery,
  useCreateTask,
} from '../tasks/data'
import { useToday } from '../tasks/hooks'
import { ListIcon } from '../tasks/list-style'
import { listsInSidebarOrder } from '../tasks/sidebar-model'
import { rankSections, type PaletteEntry } from './palette-ranking'
import { useMe } from './use-me'

const VIEW_ICONS: Record<SmartView, ReactNode> = {
  'my-day': <Sun />,
  important: <Star />,
  planned: <CalendarDays />,
  overdue: <CalendarClock />,
  assigned: <UserCheck />,
  all: <Inbox />,
  completed: <CircleCheck />,
}

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onShowShortcuts: () => void
  onNewList: () => void
  onNewGroup: () => void
}

/** ⌘K / Ctrl+K: jump anywhere, run actions, find or add tasks. */
export function CommandPalette({ open, onOpenChange, ...actions }: CommandPaletteProps) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-40 bg-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              />
            </DialogPrimitive.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-start justify-center p-3 pt-[max(0.75rem,12dvh)]">
              <DialogPrimitive.Content asChild forceMount aria-describedby={undefined}>
                <motion.div
                  className="pointer-events-auto w-full max-w-xl overflow-hidden rounded-2xl bg-elevated shadow-lg outline-none"
                  initial={{ opacity: 0, scale: 0.98, y: -8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
                  transition={springs.snappy}
                >
                  <DialogPrimitive.Title className="sr-only">
                    {t('palette.label')}
                  </DialogPrimitive.Title>
                  <PaletteContent onClose={() => onOpenChange(false)} {...actions} />
                </motion.div>
              </DialogPrimitive.Content>
            </div>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  )
}

function PaletteContent({
  onClose,
  onShowShortcuts,
  onNewList,
  onNewGroup,
}: Omit<CommandPaletteProps, 'open' | 'onOpenChange'> & { onClose: () => void }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const me = useMe()
  const today = useToday()
  const updateMe = useUpdateMe()
  const logout = useLogout()
  const create = useCreateTask()
  const [search, setSearch] = useState('')
  // The entry picked with the arrow keys – for the search it was picked at.
  const [picked, setPicked] = useState<{ value: string; search: string } | null>(null)
  const query = useDebounced(search.trim(), 200)
  const { data: lists = [] } = useQuery(listsQuery)
  const { data: groups = [] } = useQuery(groupsQuery)
  const { data: tags = [] } = useQuery(tagsQuery)
  const { data: found = [] } = useQuery({ ...searchQuery(query), enabled: query.length >= 2 })

  const listsById = new Map(lists.map((list) => [list.id, list]))
  const writable = lists.filter((list) => list.role !== 'viewer')
  const text = search.trim()
  const parsed =
    text && me.preferences.smartEntry
      ? parseQuickEntry(text, { today, locale: i18n.language as Locale, lists: writable })
      : null
  const newTitle = parsed?.title ?? text
  const targetList = parsed?.listId ? listsById.get(parsed.listId) : undefined

  const run = (action: () => void) => () => {
    onClose()
    action()
  }

  const addTask = run(() => {
    create.mutate({
      id: newTaskId(),
      title: newTitle,
      ...(parsed?.listId ? { listId: parsed.listId } : {}),
      ...(parsed?.dueDate ? { dueDate: parsed.dueDate, dueTime: parsed.dueTime } : {}),
      ...(parsed?.recurrence ? { recurrence: parsed.recurrence } : {}),
      ...(parsed?.important ? { important: true } : {}),
      ...(parsed && parsed.priority !== null ? { priority: parsed.priority } : {}),
      ...(parsed?.tags.length ? { tags: parsed.tags } : {}),
    })
    toast({ title: t('palette.created', { title: newTitle }) })
  })

  const signOut = run(() => {
    void logout
      .mutateAsync()
      .catch(() => undefined)
      .then(() => navigate({ to: '/login', replace: true }))
  })

  const themes = {
    light: { label: t('palette.themeLight'), icon: <SunMedium /> },
    dark: { label: t('palette.themeDark'), icon: <Moon /> },
    system: { label: t('palette.themeSystem'), icon: <Monitor /> },
  }

  const sections = rankSections(
    [
      {
        heading: t('palette.goTo'),
        entries: [
          ...SMART_VIEWS.map((view) => ({
            value: `view:${view}`,
            label: t(`views.${view}`),
            icon: VIEW_ICONS[view],
            onSelect: run(() => void navigate({ to: `/${view}` })),
          })),
          {
            value: 'stats',
            label: t('stats.title'),
            icon: <ChartColumn />,
            onSelect: run(() => void navigate({ to: '/stats' })),
          },
          {
            value: 'settings',
            label: t('common.settings'),
            icon: <Settings />,
            onSelect: run(() => void navigate({ to: '/settings' })),
          },
        ],
      },
      {
        heading: t('palette.lists'),
        entries: listsInSidebarOrder(lists, groups).map((list) => ({
          value: `list:${list.id}`,
          label: list.name,
          icon: <ListIcon list={list} className="size-4.5" />,
          onSelect: run(() => void navigate({ to: '/lists/$listId', params: { listId: list.id } })),
        })),
      },
      {
        heading: t('palette.tags'),
        entries: tags.map((tag) => ({
          value: `tag:${tag.name}`,
          label: `#${tag.name}`,
          icon: <Hash />,
          onSelect: run(() => void navigate({ to: '/tags/$tag', params: { tag: tag.name } })),
        })),
      },
      {
        heading: t('palette.tasks'),
        entries:
          query.length >= 2 && text
            ? found.slice(0, 8).map((task) => {
                const list = listsById.get(task.listId)
                return {
                  value: `task:${task.id}`,
                  label: task.title,
                  hint: list?.name,
                  icon: list ? <ListIcon list={list} className="size-4.5" /> : <Inbox />,
                  rank: 'found' as const,
                  onSelect: run(
                    () =>
                      void navigate({
                        to: '/lists/$listId',
                        params: { listId: task.listId },
                        search: { task: task.id },
                      }),
                  ),
                }
              })
            : [],
      },
      {
        heading: t('palette.typed'),
        entries: text
          ? [
              {
                value: 'create-task',
                label: targetList
                  ? t('palette.createTaskIn', { title: newTitle, list: targetList.name })
                  : t('palette.createTask', { title: newTitle }),
                icon: <Plus />,
                rank: 'last' as const,
                onSelect: addTask,
              },
              ...(text.length >= 2
                ? [
                    {
                      value: 'search',
                      label: t('palette.searchFor', { query: text }),
                      icon: <Search />,
                      rank: 'last' as const,
                      onSelect: run(() => void navigate({ to: '/search', search: { q: text } })),
                    },
                  ]
                : []),
            ]
          : [],
      },
      {
        heading: t('palette.actions'),
        entries: [
          {
            value: 'new-list',
            label: t('palette.newList'),
            icon: <Plus />,
            onSelect: run(onNewList),
          },
          {
            value: 'new-group',
            label: t('palette.newGroup'),
            icon: <FolderPlus />,
            onSelect: run(onNewGroup),
          },
          ...(['light', 'dark', 'system'] as const)
            .filter((theme) => theme !== me.preferences.theme)
            .map((theme) => ({
              value: `theme:${theme}`,
              ...themes[theme],
              onSelect: run(() => updateMe.mutate({ preferences: { theme } })),
            })),
          {
            value: 'shortcuts',
            label: t('palette.shortcuts'),
            icon: <Keyboard />,
            onSelect: run(onShowShortcuts),
          },
          { value: 'sign-out', label: t('common.signOut'), icon: <LogOut />, onSelect: signOut },
        ],
      },
    ],
    text,
  )

  // A new search selects the best match; arrow keys pick others until it changes.
  const first = sections[0]?.entries[0]?.value ?? ''
  const valid = sections.some((section) =>
    section.entries.some((entry) => entry.value === picked?.value),
  )
  const selected = picked && picked.search === search && valid ? picked.value : first

  return (
    <Command
      label={t('palette.label')}
      shouldFilter={false}
      value={selected}
      onValueChange={(value) => setPicked({ value, search })}
      loop
      // Its Ctrl+J/K/N/P bindings would swallow Ctrl+K, which closes the palette.
      vimBindings={false}
      className="flex max-h-[min(70dvh,34rem)] flex-col"
    >
      <div className="flex shrink-0 items-center gap-2.5 px-4 hairline-b">
        <Search aria-hidden className="size-4.5 shrink-0 text-text-secondary" />
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder={t('palette.placeholder')}
          className="h-13 min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-text-tertiary"
        />
      </div>
      <Command.List className="min-h-0 flex-1 overflow-y-auto p-2 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-footnote [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-text-secondary">
        <Command.Empty className="px-3 py-8 text-center text-callout text-text-secondary">
          {t('palette.empty')}
        </Command.Empty>
        {sections.map((section) => (
          <Command.Group key={section.heading} heading={section.heading}>
            {section.entries.map((entry) => (
              <Item key={entry.value} entry={entry} />
            ))}
          </Command.Group>
        ))}
      </Command.List>
    </Command>
  )
}

function Item({ entry }: { entry: PaletteEntry }) {
  return (
    <Command.Item
      value={entry.value}
      onSelect={entry.onSelect}
      className="group flex h-10 cursor-default items-center gap-3 rounded-lg px-2.5 text-callout text-text data-[selected=true]:bg-accent data-[selected=true]:text-on-accent pointer-coarse:h-12"
    >
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center [&_svg]:size-4.5"
      >
        {entry.icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
      {entry.hint && (
        <span className="max-w-40 shrink-0 truncate text-footnote text-text-secondary group-data-[selected=true]:text-on-accent">
          {entry.hint}
        </span>
      )}
    </Command.Item>
  )
}

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}
