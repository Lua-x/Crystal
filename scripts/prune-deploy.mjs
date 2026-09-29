// Removes files the production image never needs from a `pnpm deploy` output:
// type declarations, source maps, docs, native sources and prebuilt binaries
// for other platforms. Usage: node scripts/prune-deploy.mjs <deploy-dir>
import { lstatSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
if (!root) {
  console.error('Usage: node scripts/prune-deploy.mjs <deploy-dir>')
  process.exit(1)
}

const REMOVABLE_FILE = /(\.d\.[cm]?ts|\.map|\.md|\.markdown|\.tsbuildinfo)$/i
const target = `${process.platform}-${process.arch}`
let removedBytes = 0

// pnpm links packages with symlinks; they are never followed, only real files count.
function size(path) {
  const stats = lstatSync(path, { throwIfNoEntry: false })
  if (!stats) return 0
  if (!stats.isDirectory()) return stats.size
  return readdirSync(path).reduce((total, entry) => total + size(join(path, entry)), 0)
}

function remove(path) {
  removedBytes += size(path)
  rmSync(path, { recursive: true, force: true })
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (entry.name === '@types') {
        remove(path)
      } else if (entry.name === 'better-sqlite3' && dir.endsWith('node_modules')) {
        pruneBetterSqlite(path)
      } else if (entry.name === 'swagger-ui-dist' && dir.endsWith('node_modules')) {
        pruneSwaggerUi(path)
      } else {
        walk(path)
      }
    } else if (REMOVABLE_FILE.test(entry.name) && !entry.name.startsWith('LICENSE')) {
      remove(path)
    }
  }
}

/** better-sqlite3 ships the SQLite sources and binaries for every platform. */
function pruneBetterSqlite(dir) {
  for (const name of ['deps', 'src', 'binding.gyp']) remove(join(dir, name))
  const prebuilds = join(dir, 'prebuilds')
  for (const file of readdirSync(prebuilds)) {
    if (file !== `${target}.node`) remove(join(prebuilds, file))
  }
  walk(dir)
}

/** The API documentation only serves the bundle and its stylesheet. */
function pruneSwaggerUi(dir) {
  const keep = new Set([
    'package.json',
    'index.js',
    'absolute-path.js',
    'swagger-ui-bundle.js',
    'swagger-ui.css',
    'LICENSE',
    'NOTICE',
  ])
  for (const file of readdirSync(dir)) {
    if (!keep.has(file)) remove(join(dir, file))
  }
}

walk(join(root, 'node_modules'))
console.log(`Pruned ${(removedBytes / 1024 / 1024).toFixed(1)} MiB from ${root}`)
