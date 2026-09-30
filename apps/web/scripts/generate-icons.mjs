// Renders the PNG app icons from public/favicon.svg. Run after changing the logo:
//   node apps/web/scripts/generate-icons.mjs
// Uses Playwright's Chromium (installed for the end-to-end tests).
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const { chromium } = require('@playwright/test')

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))
const logo = readFileSync(`${publicDir}favicon.svg`, 'utf8')
// Full-bleed for maskable and Apple icons: the platform rounds the corners itself.
// The glyph already sits inside the maskable safe zone (a circle of 80 %).
const fullBleed = logo.replace(/ rx="\d+"/, '')

const icons = [
  { file: 'icon-192.png', size: 192, svg: logo },
  { file: 'icon-512.png', size: 512, svg: logo },
  { file: 'icon-maskable-512.png', size: 512, svg: fullBleed },
  { file: 'apple-touch-icon.png', size: 180, svg: fullBleed },
]

mkdirSync(`${publicDir}icons`, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ deviceScaleFactor: 1 })
for (const { file, size, svg } of icons) {
  await page.setViewportSize({ width: size, height: size })
  const sized = svg.replace('<svg ', `<svg width="${size}" height="${size}" `)
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${sized}</body></html>`,
  )
  await page.screenshot({
    path: `${publicDir}icons/${file}`,
    omitBackground: true,
    clip: { x: 0, y: 0, width: size, height: size },
  })
  console.log(`icons/${file}`)
}
await browser.close()
