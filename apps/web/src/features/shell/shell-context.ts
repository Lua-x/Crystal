import { createContext, useContext } from 'react'

export interface ShellState {
  /** True when the sidebar is shown as an overlay (phones) instead of a column. */
  isCompact: boolean
  sidebarOpen: boolean
  toggleSidebar: () => void
}

export const ShellContext = createContext<ShellState>({
  isCompact: false,
  sidebarOpen: true,
  toggleSidebar: () => undefined,
})

export const useShell = () => useContext(ShellContext)
