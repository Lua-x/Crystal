/*
 * Development-only overview of all design tokens and components, in light and
 * dark mode. Not part of production builds and therefore not translated.
 */
import { ACCENT_PRESETS } from '@crystal/shared'
import { Bell, Inbox, LogOut, Pencil, Settings, Star, Trash2 } from 'lucide-react'
import { useState } from 'react'

import { Logo } from '../../components/brand/logo'
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../../components/ui/dropdown-menu'
import { EmptyState } from '../../components/ui/empty-state'
import { Field } from '../../components/ui/field'
import { GroupedRow, GroupedSection } from '../../components/ui/grouped'
import { IconButton } from '../../components/ui/icon-button'
import { Input, PasswordInput } from '../../components/ui/input'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Select } from '../../components/ui/select'
import { Spinner } from '../../components/ui/spinner'
import { Switch } from '../../components/ui/switch'
import { toast } from '../../components/ui/toast-store'
import { applyAppearance } from '../../lib/appearance'

const SURFACES = [
  'canvas',
  'window',
  'grouped',
  'cell',
  'elevated',
  'fill-control',
  'fill-selected',
]
const TEXT = [
  'text',
  'text-secondary',
  'text-tertiary',
  'accent-text',
  'danger',
  'success',
  'warning',
]
const TYPE_SCALE = [
  ['large-title', 'text-large-title font-bold'],
  ['title1', 'text-title1 font-bold'],
  ['title2', 'text-title2 font-bold'],
  ['title3', 'text-title3 font-semibold'],
  ['body', 'text-body'],
  ['callout', 'text-callout'],
  ['subhead', 'text-subhead'],
  ['footnote', 'text-footnote'],
  ['caption', 'text-caption'],
] as const

export function DesignPage() {
  const [theme, setTheme] = useState<'system' | 'light' | 'dark'>('system')
  const [accent, setAccent] = useState('blue')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [segment, setSegment] = useState('week')

  const update = (next: { theme?: typeof theme; accent?: string }) => {
    const nextTheme = next.theme ?? theme
    const nextAccent = next.accent ?? accent
    setTheme(nextTheme)
    setAccent(nextAccent)
    applyAppearance({ theme: nextTheme, accentColor: nextAccent }, 'en')
  }

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 px-6 py-3 hairline-b material-bar">
        <Logo className="size-7" />
        <span className="text-callout font-semibold">Crystal design system</span>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          <SegmentedControl
            aria-label="Theme"
            value={theme}
            onValueChange={(value) => update({ theme: value })}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
          <Select
            aria-label="Accent"
            value={accent}
            onChange={(event) => update({ accent: event.target.value })}
          >
            {ACCENT_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-8">
        <section className="flex flex-col gap-3">
          <h2 className="text-title2 font-bold">Colors</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
            {SURFACES.map((token) => (
              <div key={token} className="flex flex-col gap-1.5">
                <div
                  className="h-14 rounded-xl shadow-sm"
                  style={{ background: `var(--color-${token})` }}
                />
                <code className="text-caption text-text-secondary">{token}</code>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-cell p-4 shadow-sm">
            {TEXT.map((token) => (
              <span
                key={token}
                className="text-body font-medium"
                style={{ color: `var(--color-${token})` }}
              >
                {token}
              </span>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-title2 font-bold">Typography</h2>
          <div className="flex flex-col gap-2 rounded-xl bg-cell p-5 shadow-sm">
            {TYPE_SCALE.map(([name, className]) => (
              <div key={name} className="flex items-baseline gap-4">
                <code className="w-24 shrink-0 text-caption text-text-secondary">{name}</code>
                <span className={className}>Müll rausbringen morgen 18 Uhr</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-title2 font-bold">Buttons</h2>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="plain">Plain</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Delete</Button>
            <Button variant="destructive-plain">Remove</Button>
            <Button variant="primary" loading>
              Saving
            </Button>
            <Button variant="primary" disabled>
              Disabled
            </Button>
            <Button variant="primary" size="sm">
              Small
            </Button>
            <IconButton label="Star">
              <Star />
            </IconButton>
            <IconButton label="Notifications">
              <Bell />
            </IconButton>
            <Spinner />
          </div>
          <Button variant="primary" size="lg" className="max-w-xs">
            Large primary
          </Button>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <div className="flex flex-col gap-4">
            <h2 className="text-title2 font-bold">Inputs</h2>
            <Field label="Title" description="What needs to be done?">
              {(props) => <Input {...props} placeholder="Buy oat milk" />}
            </Field>
            <Field label="Password" error="At least 8 characters">
              {(props) => <PasswordInput {...props} defaultValue="short" />}
            </Field>
            <Field label="List" optional>
              {(props) => (
                <Select {...props}>
                  <option>Household</option>
                  <option>Groceries</option>
                </Select>
              )}
            </Field>
          </div>
          <div className="flex flex-col gap-4">
            <h2 className="text-title2 font-bold">Controls</h2>
            <SegmentedControl
              aria-label="Range"
              value={segment}
              onValueChange={setSegment}
              options={[
                { value: 'day', label: 'Day' },
                { value: 'week', label: 'Week' },
                { value: 'month', label: 'Month' },
              ]}
            />
            <div className="flex items-center gap-3">
              <Switch defaultChecked aria-label="On" />
              <Switch aria-label="Off" />
              <Avatar name="Anna Schmidt" />
              <Avatar name="Ben" className="size-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Neutral</Badge>
              <Badge tone="accent">Accent</Badge>
              <Badge tone="success">Active</Badge>
              <Badge tone="warning">Due soon</Badge>
              <Badge tone="danger">Overdue</Badge>
            </div>
            <Alert>The current password is incorrect.</Alert>
            <Alert tone="info">Registration is open on this instance.</Alert>
          </div>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          <GroupedSection title="Grouped list" footer="Rows with controls, like iOS settings.">
            <GroupedRow icon={<Bell />} label="Reminders" description="Push and ntfy">
              <Switch defaultChecked aria-label="Reminders" />
            </GroupedRow>
            <GroupedRow icon={<Inbox />} label="Default list">
              <span className="text-callout text-text-secondary">Tasks</span>
            </GroupedRow>
          </GroupedSection>
          <div className="rounded-xl bg-cell shadow-sm">
            <EmptyState
              icon={<Inbox />}
              title="Nothing planned"
              body="Tasks with a due date show up here."
              action={<Button variant="primary">New task</Button>}
            />
          </div>
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-title2 font-bold">Overlays</h2>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setDialogOpen(true)}>Dialog</Button>
            <Button onClick={() => setConfirmOpen(true)}>Confirm</Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button>Menu</Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuLabel>anna@example.org</DropdownMenuLabel>
                <DropdownMenuItem icon={<Pencil />}>Rename</DropdownMenuItem>
                <DropdownMenuItem icon={<Settings />}>Settings</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<LogOut />}>Sign out</DropdownMenuItem>
                <DropdownMenuItem icon={<Trash2 />} destructive>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={() => toast.success('Saved', 'Your changes were saved.')}>
              Toast
            </Button>
            <Button onClick={() => toast.error('Could not save')}>Error toast</Button>
          </div>
        </section>
      </main>

      <Dialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="New invite link"
        description="Anyone with the link can create an account."
        footer={
          <>
            <Button onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setDialogOpen(false)}>
              Create
            </Button>
          </>
        }
      >
        <Field label="Note" optional>
          {(props) => <Input {...props} placeholder="For Lena" />}
        </Field>
      </Dialog>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete “Household”?"
        description="All tasks in this list will be deleted."
        confirmLabel="Delete"
        destructive
        onConfirm={() => new Promise((resolve) => setTimeout(resolve, 600))}
      />
    </div>
  )
}
