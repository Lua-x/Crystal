import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { defineConfig, devices } from '@playwright/test'

const PORT = 4173
const BASE_URL = `http://localhost:${PORT}`
/** A second instance, set up in gaming mode by `e2e/gaming`. */
const GAMING_PORT = 4174
const GAMING_URL = `http://localhost:${GAMING_PORT}`

// Every run starts with empty instances. Build first: `pnpm build`.
const dataDir = process.env.E2E_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'crystal-e2e-'))
process.env.E2E_DATA_DIR = dataDir
const gamingDataDir =
  process.env.E2E_GAMING_DATA_DIR ?? mkdtempSync(join(tmpdir(), 'crystal-e2e-gaming-'))
process.env.E2E_GAMING_DATA_DIR = gamingDataDir

const serverEnv = {
  NODE_ENV: 'production',
  HOST: '127.0.0.1',
  STATIC_DIR: 'apps/web/dist',
  REGISTRATION: 'invite',
  LOG_LEVEL: 'warn',
  // Reminders go out within a second, so tests do not wait long.
  REMINDER_INTERVAL_SECONDS: '1',
}

export default defineConfig({
  testDir: 'e2e',
  // The specs build on each other (setup → invite → …) and share one instance.
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', testIgnore: 'gaming/**', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'gaming',
      testDir: 'e2e/gaming',
      use: { ...devices['Desktop Chrome'], baseURL: GAMING_URL },
    },
  ],
  webServer: [
    {
      command: 'node apps/server/dist/index.js',
      url: `${BASE_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: { ...serverEnv, PORT: String(PORT), BASE_URL, DATA_DIR: dataDir },
    },
    {
      command: 'node apps/server/dist/index.js',
      url: `${GAMING_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...serverEnv,
        PORT: String(GAMING_PORT),
        BASE_URL: GAMING_URL,
        DATA_DIR: gamingDataDir,
      },
    },
  ],
})
