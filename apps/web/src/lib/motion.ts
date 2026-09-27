import type { Transition } from 'motion/react'

/** Spring presets. Short and soft: things settle quickly without wobbling. */
export const springs = {
  /** Selection indicators, toggles. */
  snappy: { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 },
  /** Panels, dialogs and sheets. */
  gentle: { type: 'spring', stiffness: 360, damping: 34 },
  /** Content moving in lists. */
  smooth: { type: 'spring', stiffness: 260, damping: 30 },
} satisfies Record<string, Transition>
