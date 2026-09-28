import type { ListColor } from '@crystal/shared'

/** Literal class names, so Tailwind can find them at build time. */
export const LIST_TEXT_CLASS: Record<ListColor, string> = {
  red: 'text-list-red',
  orange: 'text-list-orange',
  yellow: 'text-list-yellow',
  green: 'text-list-green',
  mint: 'text-list-mint',
  teal: 'text-list-teal',
  blue: 'text-list-blue',
  indigo: 'text-list-indigo',
  purple: 'text-list-purple',
  pink: 'text-list-pink',
  brown: 'text-list-brown',
  gray: 'text-list-gray',
}

export const LIST_BG_CLASS: Record<ListColor, string> = {
  red: 'bg-list-red',
  orange: 'bg-list-orange',
  yellow: 'bg-list-yellow',
  green: 'bg-list-green',
  mint: 'bg-list-mint',
  teal: 'bg-list-teal',
  blue: 'bg-list-blue',
  indigo: 'bg-list-indigo',
  purple: 'bg-list-purple',
  pink: 'bg-list-pink',
  brown: 'bg-list-brown',
  gray: 'bg-list-gray',
}
