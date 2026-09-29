import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { serveStatic } from '@hono/node-server/serve-static'
import type { Hono } from 'hono'

import type { AppEnv } from './context.js'

/**
 * Serves the built web app. Hashed assets are cached forever; everything else is
 * revalidated so a new release shows up on the next load. Unknown paths get
 * `index.html` so client-side routes work on reload.
 */
export function mountWebApp(app: Hono<AppEnv>, root: string): void {
  const indexHtml = readFileSync(join(root, 'index.html'), 'utf8')

  app.use(
    '/assets/*',
    serveStatic({
      root,
      onFound: (_path, c) => {
        c.header('Cache-Control', 'public, max-age=31536000, immutable')
      },
    }),
  )
  app.use(
    '*',
    serveStatic({
      root,
      onFound: (path, c) => {
        // The service worker must update together with the app.
        const revalidate = path.endsWith('.html') || path.endsWith('/sw.js')
        c.header('Cache-Control', revalidate ? 'no-cache' : 'public, max-age=3600')
      },
    }),
  )
  app.get('*', (c) => {
    c.header('Cache-Control', 'no-cache')
    return c.html(indexHtml)
  })
}
