import { useId } from 'react'

import { cn } from '../../lib/cn'

/** The Crystal app mark: a cut gem on a rounded tile. Decorative. */
export function Logo({ className }: { className?: string }) {
  const gradientId = useId()
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={cn('size-10', className)}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5aa7ff" />
          <stop offset="1" stopColor="#1a5fd8" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill={`url(#${gradientId})`} />
      <path d="M19 25 26 16h12l7 9-13 25z" fill="#fff" />
      <path
        d="M19 25h26M26 16l-1.5 9L32 50l7.5-25L38 16M24.5 25 32 16l7.5 9"
        fill="none"
        stroke="#1a5fd8"
        strokeOpacity=".28"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  )
}
