// Bundles the server (including @crystal/shared) into dist/. Runtime dependencies
// stay external and are installed next to the bundle with `pnpm deploy --prod`.
import { readFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import { build } from 'esbuild'

const serverDir = fileURLToPath(new URL('..', import.meta.url))
const readJson = (relative) => JSON.parse(readFileSync(new URL(relative, import.meta.url), 'utf8'))

const serverPackage = readJson('../package.json')
const rootPackage = readJson('../../../package.json')

rmSync(new URL('../dist', import.meta.url), { recursive: true, force: true })

await build({
  absWorkingDir: serverDir,
  entryPoints: { index: 'src/index.ts', healthcheck: 'src/healthcheck.ts' },
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  sourcemap: true,
  external: Object.keys(serverPackage.dependencies ?? {}),
  define: { __CRYSTAL_VERSION__: JSON.stringify(rootPackage.version) },
  logLevel: 'info',
})
