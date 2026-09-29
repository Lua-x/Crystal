import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import type { Attachment, List, Task } from '@crystal/shared'
import { afterEach, describe, expect, it } from 'vitest'

import {
  createTestContext,
  errorCode,
  registerUser,
  type TestClient,
  type TestContext,
} from './helpers.js'

let context: TestContext
let dataDir: string
afterEach(async () => {
  await context.close()
  rmSync(dataDir, { recursive: true, force: true })
})

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 1, 2, 3])
const PDF = new TextEncoder().encode('%PDF-1.7\n%âãÏÓ\n1 0 obj\n<<>>\nendobj\n')

function setup(env: Record<string, string> = {}) {
  dataDir = mkdtempSync(join(tmpdir(), 'crystal-attachments-'))
  context = createTestContext({ REGISTRATION: 'open', DATA_DIR: dataDir, ...env })
}

async function createTask(client: TestClient, input: Record<string, unknown> = {}) {
  return (await client.post<Task>('/api/v1/tasks', { title: 'Receipt', ...input })).body
}

function upload(client: TestClient, taskId: string, content: Uint8Array, name: string) {
  return client.upload<Attachment>(
    `/api/v1/tasks/${taskId}/attachments`,
    { file: new Blob([Buffer.from(content)]) },
    name,
  )
}

describe('attachments', () => {
  it('stores images and PDFs, recognized by their content', async () => {
    setup()
    const { client } = await registerUser(context, 'anna')
    const task = await createTask(client)

    const image = await upload(client, task.id, PNG, 'Kassenbon März.png')
    expect(image.status, JSON.stringify(image.body)).toBe(201)
    expect(image.body).toMatchObject({
      fileName: 'Kassenbon März.png',
      mimeType: 'image/png',
      size: PNG.byteLength,
    })
    // Stored under its id, never under the uploaded name.
    expect(readdirSync(join(dataDir, 'attachments'))).toEqual([image.body.id])

    const updated = (await client.get<Task>(`/api/v1/tasks/${task.id}`)).body
    expect(updated.attachments).toEqual([image.body])

    const shown = await client.download(`/api/v1/attachments/${image.body.id}`)
    expect(shown.status).toBe(200)
    expect([...shown.bytes]).toEqual([...PNG])
    expect(shown.headers.get('content-type')).toBe('image/png')
    expect(shown.headers.get('content-disposition')).toBe(
      'inline; filename="Kassenbon M_rz.png"; filename*=UTF-8\'\'Kassenbon%20M%C3%A4rz.png',
    )
    expect(shown.headers.get('content-security-policy')).toContain('sandbox')
    expect(shown.headers.get('x-content-type-options')).toBe('nosniff')
    expect(shown.headers.get('cache-control')).toBe('private, max-age=86400')

    const forced = await client.download(`/api/v1/attachments/${image.body.id}?download=1`)
    expect(forced.headers.get('content-disposition')).toMatch(/^attachment;/)

    // A PDF is always downloaded, whatever its name.
    const pdf = await upload(client, task.id, PDF, 'invoice.png')
    expect(pdf.body.mimeType).toBe('application/pdf')
    const document = await client.download(`/api/v1/attachments/${pdf.body.id}`)
    expect(document.headers.get('content-disposition')).toMatch(/^attachment;/)
  })

  it('rejects other files, too large ones and too many', async () => {
    setup({ ATTACHMENT_MAX_MB: '1' })
    const { client } = await registerUser(context, 'anna')
    const task = await createTask(client)

    for (const [content, name] of [
      [new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'x.svg'],
      [new TextEncoder().encode('<html><script>alert(1)</script>'), 'photo.png'],
    ] as const) {
      const response = await upload(client, task.id, content, name)
      expect(response.status).toBe(400)
      expect(errorCode(response)).toBe('unsupported_file')
    }

    const big = new Uint8Array(1024 * 1024 + 1)
    big.set(PNG)
    const tooBig = await upload(client, task.id, big, 'big.png')
    expect(tooBig.status).toBe(413)
    expect(errorCode(tooBig)).toBe('payload_too_large')

    for (let index = 0; index < 20; index++) await upload(client, task.id, PNG, `${index}.png`)
    const tooMany = await upload(client, task.id, PNG, 'one-more.png')
    expect(errorCode(tooMany)).toBe('too_many_attachments')
    expect(readdirSync(join(dataDir, 'attachments'))).toHaveLength(20)
  })

  it('follows the access to the task', async () => {
    setup()
    const anna = await registerUser(context, 'anna')
    const ben = await registerUser(context, 'ben', {}, { ip: '203.0.113.20' })
    const carla = await registerUser(context, 'carla', {}, { ip: '203.0.113.30' })
    const list = (await anna.client.post<List>('/api/v1/lists', { name: 'Home' })).body
    await anna.client.post(`/api/v1/lists/${list.id}/members`, {
      userId: ben.me.id,
      role: 'viewer',
    })
    const task = await createTask(anna.client, { listId: list.id })
    const file = (await upload(anna.client, task.id, PNG, 'plan.png')).body

    // Viewers see attachments but cannot change them; others do not even see them.
    expect((await ben.client.download(`/api/v1/attachments/${file.id}`)).status).toBe(200)
    expect((await upload(ben.client, task.id, PNG, 'mine.png')).status).toBe(403)
    expect((await ben.client.delete(`/api/v1/attachments/${file.id}`)).status).toBe(403)
    expect((await carla.client.download(`/api/v1/attachments/${file.id}`)).status).toBe(404)
    expect((await upload(carla.client, task.id, PNG, 'x.png')).status).toBe(404)

    // Attachments of deleted tasks are gone with them.
    await anna.client.delete(`/api/v1/tasks/${task.id}`)
    expect((await anna.client.download(`/api/v1/attachments/${file.id}`)).status).toBe(404)
  })

  it('deletes files with the attachment, and orphans with the cleanup', async () => {
    setup()
    const { client } = await registerUser(context, 'anna')
    const task = await createTask(client)
    const first = (await upload(client, task.id, PNG, 'a.png')).body
    const second = (await upload(client, task.id, PNG, 'b.png')).body
    const directory = join(dataDir, 'attachments')

    expect((await client.delete(`/api/v1/attachments/${first.id}`)).status).toBe(204)
    expect(existsSync(join(directory, first.id))).toBe(false)

    // A task deleted for good leaves its file behind until the cleanup.
    writeFileSync(join(directory, 'stray.partial'), 'interrupted upload')
    await client.delete(`/api/v1/tasks/${task.id}`)
    context.clock.advance(31 * 24 * 60 * 60 * 1000)
    context.services.cleanup.run()
    expect(await context.services.attachments.removeOrphans()).toBe(1)
    expect(existsSync(join(directory, second.id))).toBe(false)
    // Interrupted uploads are kept until they are an hour old (by the file's clock).
    expect(existsSync(join(directory, 'stray.partial'))).toBe(true)
  })
})
