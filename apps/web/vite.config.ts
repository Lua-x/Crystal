import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    // The API server runs separately in development (see CONTRIBUTING.md).
    // 127.0.0.1 rather than localhost: Node may resolve localhost to IPv6 (::1) first.
    proxy: { '/api': { target: 'http://127.0.0.1:3000' } },
  },
  test: {
    name: 'web',
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
