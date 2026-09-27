import { useId, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { cn } from '../../lib/cn'
import { translateMessage } from '../../lib/i18n'

export interface FieldControlProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
}

interface FieldProps {
  label: ReactNode
  description?: ReactNode
  error?: string | undefined
  optional?: boolean
  className?: string
  children: (props: FieldControlProps) => ReactNode
}

/** Label, control, hint and error message, wired up for screen readers. */
export function Field({ label, description, error, optional, className, children }: FieldProps) {
  const { t } = useTranslation()
  const id = useId()
  const descriptionId = description ? `${id}-description` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, descriptionId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-subhead font-medium text-text">
        {label}
        {optional && (
          <span className="font-regular text-text-secondary"> ({t('common.optional')})</span>
        )}
      </label>
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-footnote text-danger" role="alert">
          {translateMessage(error)}
        </p>
      ) : (
        description && (
          <p id={descriptionId} className="text-footnote text-text-secondary">
            {description}
          </p>
        )
      )}
    </div>
  )
}
