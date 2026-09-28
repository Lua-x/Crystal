import { createContext, useContext } from 'react'

export interface ShellState {
  /** True when the sidebar is shown as an overlay (phones) instead of a column. */
  isCompact: boolean
  sidebarOpen: boolean
  toggleSidebar: () => void
  openPalette: () => void
  openShortcuts: () => void
}

export const ShellContext = createContext<ShellState>({
  isCompact: false,
  sidebarOpen: true,
  toggleSidebar: () => undefined,
  openPalette: () => undefined,
  openShortcuts: () => undefined,
})

export const useShell = () => useContext(ShellContext)
