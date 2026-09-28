import { useLayoutEffect, useRef, type ComponentProps } from 'react'

import { cn } from '../../lib/cn'

/** A textarea that grows with its content. */
export function AutoTextarea({
  className,
  value,
  ref,
  ...props
}: ComponentProps<'textarea'> & { value: string }) {
  const innerRef = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const element = innerRef.current
    if (!element) return
    element.style.height = 'auto'
    element.style.height = `${element.scrollHeight}px`
  }, [value])

  return (
    <textarea
      ref={(element) => {
        innerRef.current = element
        if (typeof ref === 'function') ref(element)
        else if (ref) ref.current = element
      }}
      value={value}
      rows={1}
      className={cn(
        'block w-full resize-none overflow-hidden bg-transparent outline-none',
        className,
      )}
      {...props}
    />
  )
}
