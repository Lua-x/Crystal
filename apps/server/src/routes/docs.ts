import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

import { Hono } from 'hono'

import type { AppEnv } from '../context.js'

const require = createRequire(import.meta.url)
const SWAGGER_UI_DIR = dirname(require.resolve('swagger-ui-dist/package.json'))

/** Everything is served from Crystal itself: the CSP allows no other origins and no inline scripts. */
const PAGE = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Crystal API</title>
    <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
    <link rel="stylesheet" href="/api/docs/swagger-ui.css" />
    <link rel="stylesheet" href="/api/docs/docs.css" />
  </head>
  <body>
    <main id="swagger-ui"></main>
    <script src="/api/docs/swagger-ui-bundle.js"></script>
    <script src="/api/docs/docs.js"></script>
  </body>
</html>
`

const SCRIPT = `window.ui = SwaggerUIBundle({
  url: '/api/openapi.json',
  dom_id: '#swagger-ui',
  deepLinking: true,
  docExpansion: 'none',
  defaultModelsExpandDepth: 0,
  displayRequestDuration: true,
  filter: true,
  tryItOutEnabled: false,
})
`

const STYLE = `body { margin: 0; background: #fff; }
.swagger-ui .topbar { display: none; }
.swagger-ui .info { margin: 32px 0; }
`

interface Asset {
  body: string
  type: string
}

/**
 * `GET /api/docs`: interactive API documentation (Swagger UI) for the OpenAPI
 * document. “Try it out” uses the browser's session, or a token entered
 * under “Authorize”.
 */
export function docsRoutes() {
  const router = new Hono<AppEnv>()
  const assets = new Map<string, Asset>([
    ['docs.js', { body: SCRIPT, type: 'text/javascript; charset=utf-8' }],
    ['docs.css', { body: STYLE, type: 'text/css; charset=utf-8' }],
  ])
  // Read lazily: most instances never open the documentation.
  const vendor = (name: string, type: string): Asset => {
    let asset = assets.get(name)
    if (!asset) {
      asset = { body: readFileSync(join(SWAGGER_UI_DIR, name), 'utf8'), type }
      assets.set(name, asset)
    }
    return asset
  }

  router.get('/', (c) => {
    c.header('Cache-Control', 'no-cache')
    return c.html(PAGE)
  })

  router.get('/:file{[a-z.-]+}', (c) => {
    const file = c.req.param('file')
    let asset: Asset | undefined = assets.get(file)
    if (!asset && file === 'swagger-ui-bundle.js') {
      asset = vendor(file, 'text/javascript; charset=utf-8')
    } else if (!asset && file === 'swagger-ui.css') {
      asset = vendor(file, 'text/css; charset=utf-8')
    }
    if (!asset) return c.notFound()
    c.header('Content-Type', asset.type)
    c.header('Cache-Control', 'public, max-age=86400')
    return c.body(asset.body)
  })

  return router
}
