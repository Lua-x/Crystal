import { createServer, type IncomingHttpHeaders } from 'node:http'
import type { AddressInfo } from 'node:net'
import { fileURLToPath } from 'node:url'

import type { Me } from '@crystal/shared'

import { createApp, type App } from '../src/app.js'
import { loadConfig } from '../src/config.js'
import { openDatabase, runMigrations } from '../src/db/client.js'
import { createLogger } from '../src/lib/logger.js'
import type { Mail, Mailer } from '../src/notifications/mailer.js'
import type { Notification } from '../src/notifications/messages.js'
import { DeliveryError, type DeliveryFailure } from '../src/notifications/network.js'
import type { PushSender, PushTarget } from '../src/notifications/push.js'
import { createServices, type Services } from '../src/services/index.js'

export const BASE_URL = 'http://crystal.test'
const MIGRATIONS_DIR = fileURLToPath(new URL('../drizzle', import.meta.url))

export interface TestContext {
  app: App
  services: Services
  clock: { now: () => Date; advance: (ms: number) => void; set: (iso: string) => void }
  client: (options?: ClientOptions) => TestClient
  /** Captures Web Push messages instead of sending them. */
  push: FakePush
  /** Captures email; only set up with `{ mailer: true }` (as if SMTP were configured). */
  mailer: FakeMailer | undefined
  close: () => Promise<void>
}

export interface TestContextOptions {
  mailer?: boolean
}

/** A fresh in-memory instance with its own database and a controllable clock. */
export function createTestContext(
  env: Record<string, string> = {},
  options: TestContextOptions = {},
): TestContext {
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
    set: (iso: string) => {
      current = new Date(iso)
    },
  }

  const push = new FakePush()
  const mailer = options.mailer ? new FakeMailer() : undefined
  const services = createServices({
    config,
    logger: createLogger(config),
    db: database.db,
    secretKey: TEST_SECRET_KEY,
    version: 'test',
    now: clock.now,
    pushSender: push,
    ...(mailer ? { mailer } : {}),
  })
  const app = createApp(services, { heartbeatMs: 50 })

  return {
    app,
    services,
    clock,
    client: (clientOptions) => new TestClient(app, clientOptions),
    push,
    mailer,
    close: async () => {
      // Open event streams would otherwise keep polling a closed database.
      services.events.closeAll()
      await services.notifications.idle()
      database.close()
    },
  }
}

export const TEST_SECRET_KEY = 'test-secret-key-that-is-long-enough-for-hkdf'

export class FakePush implements PushSender {
  readonly sent: Array<{ endpoint: string; notification: Notification }> = []
  /** Makes every delivery fail with this reason. */
  failWith: DeliveryFailure | undefined

  send(target: PushTarget, payload: string): Promise<void> {
    if (this.failWith) return Promise.reject(new DeliveryError(this.failWith))
    this.sent.push({ endpoint: target.endpoint, notification: JSON.parse(payload) as Notification })
    return Promise.resolve()
  }
}

export class FakeMailer implements Mailer {
  readonly sent: Mail[] = []
  fail = false

  send(mail: Mail): Promise<void> {
    if (this.fail) return Promise.reject(new DeliveryError('smtp'))
    this.sent.push(mail)
    return Promise.resolve()
  }
}

export interface CapturedRequest {
  method: string
  path: string
  headers: IncomingHttpHeaders
  body: unknown
}

/** A local HTTP server standing in for ntfy, Gotify or Apprise. */
export async function startCaptureServer() {
  const requests: CapturedRequest[] = []
  let status = 200
  let location: string | undefined
  const server = createServer((request, response) => {
    let raw = ''
    request.setEncoding('utf8')
    request.on('data', (chunk: string) => (raw += chunk))
    request.on('end', () => {
      requests.push({
        method: request.method ?? '',
        path: request.url ?? '',
        headers: request.headers,
        body: raw ? (JSON.parse(raw) as unknown) : undefined,
      })
      response.writeHead(status, location ? { location } : {})
      response.end('{"secret":"never shown"}')
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    respondWith(nextStatus: number, nextLocation?: string) {
      status = nextStatus
      location = nextLocation
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
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

  /** Posts `multipart/form-data`, like a file upload from the browser. */
  upload<T = unknown>(path: string, fields: Record<string, Blob | string>, fileName = 'file') {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) {
      if (typeof value === 'string') form.append(name, value)
      else form.append(name, value, fileName)
    }
    return this.request<T>('POST', path, form)
  }

  /** Downloads raw bytes. */
  async download(path: string): Promise<{ status: number; bytes: Uint8Array; headers: Headers }> {
    const headers = new Headers({ 'x-forwarded-for': this.options.ip ?? '203.0.113.10' })
    if (this.cookies.size > 0) {
      headers.set('cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '))
    }
    const response = await this.app.request(`${BASE_URL}${path}`, { headers })
    return {
      status: response.status,
      bytes: new Uint8Array(await response.arrayBuffer()),
      headers: response.headers,
    }
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
    // Form data sets its own multipart content type (with the boundary).
    const isForm = body instanceof FormData
    if (body !== undefined && !isForm) headers.set('content-type', 'application/json')

    const response = await this.app.request(`${BASE_URL}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
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
