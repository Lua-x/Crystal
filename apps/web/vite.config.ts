import { createHash } from 'node:crypto'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

/**
 * Writes `precache.json`: every file of the build, and a version that changes
 * whenever one of them does. The service worker (public/sw.js) caches them so
 * the app opens without a connection.
 */
function precacheManifest(): Plugin {
  return {
    name: 'crystal-precache-manifest',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map') && name !== 'index.html')
        .sort()
      const version = createHash('sha256')
        .update(files.join('\n'))
        .update(
          files
            .map((name) => {
              const file = bundle[name]!
              return file.type === 'chunk' ? file.code : String(file.source)
            })
            .join('\n'),
        )
        .digest('hex')
        .slice(0, 16)
      this.emitFile({
        type: 'asset',
        fileName: 'precache.json',
        source: JSON.stringify({ version, files: files.map((name) => `/${name}`) }),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), precacheManifest()],
  define: {
    // Part of the service worker's URL, so every build installs a fresh one.
    __CRYSTAL_BUILD__: JSON.stringify(process.env.CRYSTAL_BUILD ?? Date.now().toString(36)),
  },
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
