import { fileURLToPath } from 'node:url'

import type { Me } from '@crystal/shared'

import { createApp, type App } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openDatabase, runMigrations } from '../src/db/client.js'
import { createLogger } from '../src/lib/logger.js'
import { createServices, type Services } from '../src/services/index.js'

export const BASE_URL = 'http://crystal.test'
const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url))

export interface TestContext {
  app: App
  services: Services
  clock: { now: () => Date; advance: (ms: number) => void }
  client: (options?: ClientOptions) => TestClient
  close: () => void
}

/** A fresh in-memory instance with its own database and a controllable clock. */
export function createTestContext(env: Record<string, string> = {}): TestContext {
  const config = loadConfig({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    BASE_URL,
    DATA_DIR: 'unused-in-tests',
    TRUST_PROXY: '1',
    ...env,
  })
  const database = openDatabase(':memory:')
  runMigrations(database.db, MIGRATIONS_DIR)

  let current = new Date('2026-09-27T10:00:00.000Z')
  const clock = {
    now: () => new Date(current),
    advance: (ms: number) => {
      current = new Date(current.getTime() + ms)
    },
  }

  const services = createServices({
    config,
    logger: createLogger(config),
    db: database.db,
    secretKey: 'test-secret-key-that-is-long-enough-for-hkdf',
    version: 'test',
    now: clock.now,
  })
  const app = createApp(services, { heartbeatMs: 50 })

  return {
    app,
    services,
    clock,
    client: (options) => new TestClient(app, options),
    close: () => {
      // Open event streams would otherwise keep polling a closed database.
      services.events.closeAll()
      database.close()
    },
  }
}

export interface ClientOptions {
  /** `null` sends no Origin header at all. */
  origin?: string | null
  ip?: string
}

export interface TestResponse<T = unknown> {
  status: number
  body: T
  headers: Headers
}

/** Talks to the app like a browser: keeps cookies and sends an Origin header. */
export class TestClient {
  readonly cookies = new Map<string, string>()

  constructor(
    private readonly app: App,
    private readonly options: ClientOptions = {},
  ) {}

  get<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.request<T>('GET', path, undefined, headers)
  }

  post<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('POST', path, body, headers)
  }

  patch<T = unknown>(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request<T>('PATCH', path, body, headers)
  }

  delete<T = unknown>(path: string, headers?: Record<string, string>) {
    return this.request<T>('DELETE', path, undefined, headers)
  }

  /** Opens a Server-Sent Events stream; `next()` resolves with the next event or `null`. */
  async openStream(path: string) {
    const controller = new AbortController()
    const headers = new Headers({ 'x-forwarded-for': this.options.ip ?? '203.0.113.10' })
    if (this.cookies.size > 0) {
      headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    }
    const response = await this.app.request(`${BASE_URL}${path}`, {
      headers,
      signal: controller.signal,
    })
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let pending: ReturnType<typeof reader.read> | undefined

    const next = async (timeoutMs = 500): Promise<{ event: string; data: unknown } | null> => {
      const deadline = Date.now() + timeoutMs
      for (;;) {
        const end = buffer.indexOf('\n\n')
        if (end !== -1) {
          const block = buffer.slice(0, end)
          buffer = buffer.slice(end + 2)
          if (block.startsWith(':')) continue // keep-alive comment
          const field = (name: string) =>
            block
              .split('\n')
              .find((line) => line.startsWith(`${name}:`))
              ?.slice(name.length + 1)
              .trim()
          return { event: field('event') ?? 'message', data: JSON.parse(field('data') ?? 'null') }
        }
        const remaining = deadline - Date.now()
        if (remaining <= 0) return null
        pending ??= reader.read()
        const result = await Promise.race([
          pending,
          new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), remaining)),
        ])
        if (result === 'timeout') return null
        pending = undefined
        if (result.done) return null
        buffer += decoder.decode(result.value as Uint8Array, { stream: true })
      }
    }

    const close = async () => {
      controller.abort()
      await reader.cancel().catch(() => undefined)
    }
    return { status: response.status, next, close }
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {},
  ): Promise<TestResponse<T>> {
    const headers = new Headers(extraHeaders)
    const origin = this.options.origin === undefined ? BASE_URL : this.options.origin
    if (origin !== null && !headers.has('origin')) headers.set('origin', origin)
    headers.set('x-forwarded-for', this.options.ip ?? '203.0.113.10')
    if (this.cookies.size > 0) {
      headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    }
    if (body !== undefined) headers.set('content-type', 'application/json')

    const response = await this.app.request(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    this.storeCookies(response.headers)

    const text = await response.text()
    let parsed: unknown = text
    try {
      parsed = text ? JSON.parse(text) : undefined
    } catch {
      // Not JSON (e.g. a redirect); keep the raw text.
    }
    return { status: response.status, body: parsed as T, headers: response.headers }
  }

  private storeCookies(headers: Headers): void {
    for (const cookie of headers.getSetCookie()) {
      const [pair = '', ...attributes] = cookie.split(';')
      const separator = pair.indexOf('=')
      const name = pair.slice(0, separator).trim()
      const value = pair.slice(separator + 1).trim()
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/i.test(attribute))
      if (expired || value === '') this.cookies.delete(name)
      else this.cookies.set(name, value)
    }
  }
}

export const PASSWORD = 'correct horse battery staple'

/** Registers a user through the API and returns the signed-in client. */
export async function registerUser(
  context: TestContext,
  username: string,
  extra: Record<string, unknown> = {},
  clientOptions?: ClientOptions,
): Promise<{ client: TestClient; me: Me }> {
  const client = context.client(clientOptions)
  const response = await client.post<Me>('/api/v1/auth/register', {
    username,
    displayName: username[0]!.toUpperCase() + username.slice(1),
    password: PASSWORD,
    ...extra,
  })
  if (response.status !== 201) {
    throw new Error(`Registration failed: ${response.status} ${JSON.stringify(response.body)}`)
  }
  return { client, me: response.body }
}

/** Creates an invite as `admin` and returns its token. */
export async function createInvite(
  admin: TestClient,
  input: Record<string, unknown> = {},
): Promise<string> {
  const response = await admin.post<{ token: string }>('/api/v1/admin/invites', {
    role: 'user',
    maxUses: 1,
    expiresInDays: 7,
    ...input,
  })
  if (response.status !== 201) {
    throw new Error(`Creating invite failed: ${response.status} ${JSON.stringify(response.body)}`)
  }
  return response.body.token
}

export function errorCode(response: TestResponse): string | undefined {
  return (response.body as { error?: { code?: string } } | undefined)?.error?.code
}
