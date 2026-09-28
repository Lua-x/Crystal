import { Fragment, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { Dialog } from '../../components/ui/dialog'
import { isMac } from './shortcuts'

function Keys({ keys }: { keys: string[][] }) {
  const { t } = useTranslation()
  return (
    <span className="flex shrink-0 flex-wrap items-center justify-end gap-1">
      {keys.map((combination, index) => (
        <Fragment key={combination.join('+')}>
          {index > 0 && (
            <span className="text-footnote text-text-secondary">{t('shortcuts.then')}</span>
          )}
          {combination.map((key) => (
            <kbd
              key={key}
              className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-fill-control px-1.5 font-sans text-footnote font-medium text-text shadow-xs"
            >
              {key}
            </kbd>
          ))}
        </Fragment>
      ))}
    </span>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h3 className="text-subhead font-semibold text-text-secondary">{title}</h3>
      <dl className="flex flex-col">{children}</dl>
    </section>
  )
}

function Row({ label, keys }: { label: string; keys: string[][] }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-4 border-b border-separator py-1.5 last:border-0">
      <dt className="text-callout">{label}</dt>
      <dd>
        <Keys keys={keys} />
      </dd>
    </div>
  )
}

/** The overview behind `?`. */
export function ShortcutsDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const mod = isMac() ? '⌘' : 'Ctrl'
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('shortcuts.title')}
      className="sm:max-w-lg"
      focusableBody
    >
      <div className="flex flex-col gap-6">
        <Section title={t('shortcuts.general')}>
          <Row label={t('shortcuts.palette')} keys={[[mod, 'K']]} />
          <Row label={t('shortcuts.newTask')} keys={[['N']]} />
          <Row label={t('shortcuts.search')} keys={[['/']]} />
          <Row label={t('shortcuts.help')} keys={[['?']]} />
          <Row label={t('shortcuts.close')} keys={[['Esc']]} />
        </Section>
        <Section title={t('shortcuts.navigation')}>
          <Row label={t('shortcuts.goMyDay')} keys={[['G'], ['D']]} />
          <Row label={t('shortcuts.goImportant')} keys={[['G'], ['I']]} />
          <Row label={t('shortcuts.goPlanned')} keys={[['G'], ['P']]} />
          <Row label={t('shortcuts.goAll')} keys={[['G'], ['A']]} />
          <Row label={t('shortcuts.goCompleted')} keys={[['G'], ['C']]} />
          <Row label={t('shortcuts.goSettings')} keys={[['G'], ['S']]} />
        </Section>
        <Section title={t('shortcuts.tasks')}>
          <Row label={t('shortcuts.move')} keys={[['↑', '↓']]} />
          <Row label={t('shortcuts.open')} keys={[['↵']]} />
          <Row label={t('shortcuts.complete')} keys={[['X']]} />
          <Row label={t('shortcuts.star')} keys={[['S']]} />
          <Row label={t('shortcuts.myDay')} keys={[['M']]} />
          <Row label={t('shortcuts.delete')} keys={[['Del']]} />
        </Section>
      </div>
    </Dialog>
  )
}
