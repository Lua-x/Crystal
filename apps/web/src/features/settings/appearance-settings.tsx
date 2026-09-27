import { ACCENT_PRESETS, type AccentPreset, type Theme } from '@crystal/shared'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { RadioGroup } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '../../components/ui/button'
import { GroupedRow, GroupedSection } from '../../components/ui/grouped'
import { SegmentedControl } from '../../components/ui/segmented-control'
import { Switch } from '../../components/ui/switch'
import { toast } from '../../components/ui/toast-store'
import { accentCssVariables, ACCENT_PRESET_COLORS } from '../../lib/accent'
import { cn } from '../../lib/cn'
import { errorMessage } from '../../lib/errors'
import { useUpdateMe } from '../../lib/queries'
import { Page } from '../shell/page'
import { useMe } from '../shell/use-me'
import { useSettingsBack } from './use-settings-back'

const CUSTOM = 'custom'
const RAINBOW = `conic-gradient(${[
  ...ACCENT_PRESETS.filter((preset) => preset !== 'graphite').map(
    (preset) => ACCENT_PRESET_COLORS[preset],
  ),
  ACCENT_PRESET_COLORS.blue,
].join(', ')})`

export function AppearanceSettingsPage() {
  const { t } = useTranslation()
  const me = useMe()
  const update = useUpdateMe()

  const save = (preferences: { theme?: Theme; accentColor?: string }) => {
    update.mutate({ preferences }, { onError: (error) => toast.error(errorMessage(error)) })
  }

  return (
    <Page title={t('settings.sections.appearance')} backTo={useSettingsBack()} variant="grouped">
      <div className="flex flex-col gap-8">
        <GroupedSection
          title={t('settings.appearance.theme')}
          footer={t('settings.appearance.themeHint')}
        >
          <div className="p-4">
            <SegmentedControl
              aria-label={t('settings.appearance.theme')}
              className="w-full"
              value={me.preferences.theme}
              onValueChange={(theme) => save({ theme })}
              options={[
                { value: 'system', label: t('settings.appearance.themeSystem'), icon: <Monitor /> },
                { value: 'light', label: t('settings.appearance.themeLight'), icon: <Sun /> },
                { value: 'dark', label: t('settings.appearance.themeDark'), icon: <Moon /> },
              ]}
            />
          </div>
        </GroupedSection>

        <GroupedSection
          title={t('settings.appearance.accent')}
          footer={t('settings.appearance.accentHint')}
        >
          <div className="p-4">
            <AccentPicker
              value={me.preferences.accentColor}
              onChange={(accentColor) => save({ accentColor })}
            />
          </div>
          <GroupedRow label={t('settings.appearance.preview')}>
            <div className="flex items-center gap-4" aria-hidden>
              <span className="text-callout font-medium text-accent-text">
                {t('settings.appearance.previewLink')}
              </span>
              <Switch defaultChecked tabIndex={-1} />
              <Button variant="primary" size="sm" tabIndex={-1}>
                {t('settings.appearance.previewButton')}
              </Button>
            </div>
          </GroupedRow>
        </GroupedSection>
      </div>
    </Page>
  )
}

/** The swatch uses the same accessible fill and check color the app would use. */
function swatchColors(color: string) {
  const variables = accentCssVariables(color)
  return { background: variables['--color-accent'], foreground: variables['--color-on-accent'] }
}

interface AccentPickerProps {
  value: string
  onChange: (value: string) => void
}

/** Preset swatches plus a custom color, as one radio group. */
function AccentPicker({ value, onChange }: AccentPickerProps) {
  const { t } = useTranslation()
  const isPreset = (ACCENT_PRESETS as readonly string[]).includes(value)
  const [custom, setCustom] = useState(isPreset ? '#3478f6' : value)
  const colorInput = useRef<HTMLInputElement>(null)
  const pending = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => () => clearTimeout(pending.current), [])

  // The native picker reports every intermediate color; save once it settles.
  const changeCustom = (color: string) => {
    setCustom(color)
    clearTimeout(pending.current)
    pending.current = setTimeout(() => onChange(color), 350)
  }

  return (
    <RadioGroup.Root
      aria-label={t('settings.appearance.accent')}
      orientation="horizontal"
      loop
      value={isPreset ? value : CUSTOM}
      onValueChange={(next) => onChange(next === CUSTOM ? custom : next)}
      className="flex flex-wrap gap-3"
    >
      {ACCENT_PRESETS.map((preset: AccentPreset) => (
        <Swatch
          key={preset}
          value={preset}
          label={t(`settings.appearance.colors.${preset}`)}
          selected={value === preset}
          {...swatchColors(ACCENT_PRESET_COLORS[preset])}
        />
      ))}
      <div className="relative">
        <Swatch
          value={CUSTOM}
          label={t('settings.appearance.accentCustom')}
          selected={!isPreset}
          {...(isPreset ? { background: RAINBOW, foreground: 'transparent' } : swatchColors(value))}
          // Only an explicit click opens the system color picker, not arrow keys.
          onClick={() => colorInput.current?.click()}
        />
        <input
          ref={colorInput}
          type="color"
          value={custom}
          onChange={(event) => changeCustom(event.target.value)}
          tabIndex={-1}
          aria-hidden
          className="pointer-events-none absolute inset-0 size-full opacity-0"
        />
      </div>
    </RadioGroup.Root>
  )
}

interface SwatchProps {
  value: string
  label: string
  background: string
  foreground: string
  selected: boolean
  onClick?: () => void
}

function Swatch({ value, label, background, foreground, selected, onClick }: SwatchProps) {
  return (
    <RadioGroup.Item
      value={value}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        'relative flex size-8 cursor-default items-center justify-center rounded-full shadow-sm transition-transform duration-150 hover:scale-105 active:scale-95',
        'pointer-coarse:size-11',
        selected && 'ring-2 ring-text-secondary ring-offset-2 ring-offset-cell',
      )}
      style={{ background, color: foreground }}
    >
      <RadioGroup.Indicator>
        <Check aria-hidden className="size-4" strokeWidth={3} />
      </RadioGroup.Indicator>
    </RadioGroup.Item>
  )
}
