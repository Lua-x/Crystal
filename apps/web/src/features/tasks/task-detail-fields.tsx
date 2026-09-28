import {
  isoWeekday,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_MAX_INTERVAL,
  tagSchema,
  type Recurrence,
  type RecurrenceBase,
  type Task,
} from '@crystal/shared'
import { useQuery } from '@tanstack/react-query'
import { Hash, Repeat, X } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { SegmentedControl } from '../../components/ui/segmented-control'
import { Select } from '../../components/ui/select'
import { inputClassName } from '../../components/ui/styles'
import { cn } from '../../lib/cn'
import { translateMessage } from '../../lib/i18n'
import { tagsQuery } from './data'
import {
  describeRecurrence,
  presetOf,
  ruleForPreset,
  weekdayNames,
  type RecurrencePreset,
} from './recurrence-text'

export function DetailRow({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-12 items-center gap-3 px-3 py-2">
      <span
        aria-hidden
        className="flex size-5 shrink-0 items-center justify-center text-text-secondary [&_svg]:size-4.5"
      >
        {icon}
      </span>
      {label && <span className="sr-only">{label}</span>}
      <div className="flex min-w-0 flex-1 items-center gap-2">{children}</div>
    </div>
  )
}

/* ── Repeat ─────────────────────────────────────────────────────── */

const PRESETS: RecurrencePreset[] = ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'yearly']

interface RecurrenceEditorProps {
  task: Task
  today: string
  disabled: boolean
  onChange: (recurrence: Recurrence | null) => void
}

/** A menu of common rules, and a custom editor for everything else. */
export function RecurrenceEditor({ task, today, disabled, onChange }: RecurrenceEditorProps) {
  const { t, i18n } = useTranslation()
  const rule = task.recurrence
  const preset = presetOf(rule)
  // "Custom" stays open while editing, even if the rule happens to match a preset.
  const [custom, setCustom] = useState(preset === 'custom')
  const showCustom = custom || preset === 'custom'

  return (
    <DetailRow icon={<Repeat />} label={t('recurrence.label')}>
      <div className="flex min-w-0 flex-1 flex-col gap-2 py-1">
        <Select
          aria-label={t('recurrence.label')}
          value={showCustom ? 'custom' : preset}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value as RecurrencePreset | 'custom'
            if (value === 'custom') {
              setCustom(true)
              // Start from something sensible: weekly on the due date's weekday.
              if (!rule) {
                onChange({
                  frequency: 'weekly',
                  interval: 1,
                  weekdays: [isoWeekday(task.dueDate ?? today)],
                  from: 'due',
                })
              }
              return
            }
            setCustom(false)
            onChange(value === 'none' ? null : ruleForPreset(value))
          }}
          className="h-8 text-callout"
        >
          {PRESETS.map((value) => (
            <option key={value} value={value}>
              {value === 'none' ? t('recurrence.none') : t(`recurrence.presets.${value}`)}
            </option>
          ))}
          <option value="custom">{t('recurrence.presets.custom')}</option>
        </Select>
        {rule && showCustom && (
          <CustomRecurrence
            key={JSON.stringify(rule)}
            rule={rule}
            disabled={disabled}
            onChange={onChange}
          />
        )}
        {rule && (
          <p className="text-footnote text-text-secondary">
            {describeRecurrence(rule, t, i18n.language)}
          </p>
        )}
      </div>
    </DetailRow>
  )
}

function CustomRecurrence({
  rule,
  disabled,
  onChange,
}: {
  rule: Recurrence
  disabled: boolean
  onChange: (recurrence: Recurrence) => void
}) {
  const { t, i18n } = useTranslation()
  const [interval, setInterval] = useState(String(rule.interval))
  const intervalId = useId()
  const unitId = useId()
  const weekdaysId = useId()
  const fromId = useId()
  const names = weekdayNames(i18n.language, 'short')
  const longNames = weekdayNames(i18n.language)

  const commitInterval = () => {
    const value = Math.round(Number(interval))
    if (!Number.isFinite(value) || value < 1 || value > RECURRENCE_MAX_INTERVAL) {
      setInterval(String(rule.interval))
      return
    }
    if (value !== rule.interval) onChange({ ...rule, interval: value })
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg bg-fill-control p-3">
      <div className="flex items-center gap-2">
        <label htmlFor={intervalId} className="text-callout">
          {t('recurrence.every')}
        </label>
        <input
          id={intervalId}
          type="number"
          inputMode="numeric"
          min={1}
          max={RECURRENCE_MAX_INTERVAL}
          value={interval}
          disabled={disabled}
          onChange={(event) => setInterval(event.target.value)}
          onBlur={commitInterval}
          onKeyDown={(event) => {
            if (event.key === 'Enter') commitInterval()
          }}
          className={cn(inputClassName, 'h-8 w-16 text-center text-callout')}
        />
        <label htmlFor={unitId} className="sr-only">
          {t('recurrence.unit')}
        </label>
        <Select
          id={unitId}
          value={rule.frequency}
          disabled={disabled}
          onChange={(event) =>
            onChange({
              ...rule,
              frequency: event.target.value as Recurrence['frequency'],
              weekdays: event.target.value === 'weekly' ? rule.weekdays : [],
            })
          }
          className="h-8 text-callout"
        >
          {RECURRENCE_FREQUENCIES.map((frequency) => (
            <option key={frequency} value={frequency}>
              {t(`recurrence.units.${frequency}`, { count: rule.interval })}
            </option>
          ))}
        </Select>
      </div>

      {rule.frequency === 'weekly' && (
        <div className="flex flex-col gap-1.5">
          <span id={weekdaysId} className="text-footnote text-text-secondary">
            {t('recurrence.on')}
          </span>
          <div role="group" aria-labelledby={weekdaysId} className="grid grid-cols-7 gap-1">
            {names.map((name, day) => {
              const active = rule.weekdays.includes(day)
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  aria-pressed={active}
                  aria-label={longNames[day]}
                  onClick={() =>
                    onChange({
                      ...rule,
                      weekdays: active
                        ? rule.weekdays.filter((item) => item !== day)
                        : [...rule.weekdays, day].sort((a, b) => a - b),
                    })
                  }
                  className={cn(
                    'h-8 cursor-default rounded-md text-footnote font-medium transition-colors pointer-coarse:h-11',
                    active ? 'bg-accent text-on-accent' : 'bg-cell text-text hover:bg-fill-hover',
                  )}
                >
                  {name}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span id={fromId} className="text-footnote text-text-secondary">
          {t('recurrence.from')}
        </span>
        <SegmentedControl<RecurrenceBase>
          aria-labelledby={fromId}
          value={rule.from}
          onValueChange={(from) => !disabled && onChange({ ...rule, from })}
          options={[
            { value: 'due', label: t('recurrence.fromDue') },
            { value: 'completion', label: t('recurrence.fromCompletion') },
          ]}
        />
        {rule.from === 'completion' && (
          <p className="text-footnote text-text-secondary">{t('recurrence.fromHint')}</p>
        )}
      </div>
    </div>
  )
}

/* ── Tags ───────────────────────────────────────────────────────── */

interface TagsEditorProps {
  task: Task
  disabled: boolean
  onChange: (tags: string[]) => void
}

/** Tags as removable chips, plus a field that suggests tags already in use. */
export function TagsEditor({ task, disabled, onChange }: TagsEditorProps) {
  const { t } = useTranslation()
  const { data: known = [] } = useQuery(tagsQuery)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string>()
  const inputId = useId()
  const errorId = useId()
  const suggestionsId = useId()

  const add = () => {
    if (!draft.trim()) return
    const result = tagSchema.safeParse(draft)
    if (!result.success) {
      setError(result.error.issues[0]?.message)
      return
    }
    setError(undefined)
    setDraft('')
    if (!task.tags.includes(result.data)) onChange([...task.tags, result.data])
  }

  return (
    <DetailRow icon={<Hash />} label={t('tags.label')}>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {task.tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex h-7 items-center gap-0.5 rounded-full bg-fill-control pr-0.5 pl-2.5 text-footnote font-medium pointer-coarse:h-9"
            >
              #{tag}
              {!disabled && (
                <button
                  type="button"
                  aria-label={t('tags.remove', { tag })}
                  onClick={() => onChange(task.tags.filter((item) => item !== tag))}
                  className="flex size-6 cursor-default items-center justify-center rounded-full text-text-secondary hover:bg-fill-hover hover:text-text pointer-coarse:size-8"
                >
                  <X aria-hidden className="size-3" />
                </button>
              )}
            </span>
          ))}
          {!disabled && (
            <>
              <label htmlFor={inputId} className="sr-only">
                {t('tags.add')}
              </label>
              <input
                id={inputId}
                value={draft}
                list={suggestionsId}
                placeholder={task.tags.length === 0 ? t('tags.add') : ''}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                autoComplete="off"
                enterKeyHint="done"
                onChange={(event) => {
                  setDraft(event.target.value)
                  setError(undefined)
                }}
                onBlur={add}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ',' || event.key === ' ') {
                    event.preventDefault()
                    add()
                  } else if (event.key === 'Backspace' && !draft && task.tags.length > 0) {
                    onChange(task.tags.slice(0, -1))
                  }
                }}
                className="h-8 min-w-24 flex-1 rounded-md bg-transparent px-1 text-callout outline-none focus-visible:bg-fill-hover"
              />
              <datalist id={suggestionsId}>
                {known
                  .filter((tag) => !task.tags.includes(tag.name))
                  .map((tag) => (
                    <option key={tag.name} value={tag.name} />
                  ))}
              </datalist>
            </>
          )}
        </div>
        {error && (
          <p id={errorId} role="alert" className="px-1 text-footnote text-danger">
            {translateMessage(error)}
          </p>
        )}
      </div>
    </DetailRow>
  )
}
