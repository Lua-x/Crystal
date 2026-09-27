import { cn } from '../../lib/cn'

/** Shared look of text inputs and selects. */
export const inputClassName = cn(
  'h-9 w-full min-w-0 rounded-lg border border-border-control bg-cell px-3 text-body text-text',
  'transition-[border-color,box-shadow] duration-150 ease-out pointer-coarse:h-11',
  'focus-visible:border-accent-text focus-visible:ring-4 focus-visible:ring-accent-soft focus-visible:outline-none',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger-soft',
  'disabled:cursor-not-allowed disabled:opacity-50',
)
