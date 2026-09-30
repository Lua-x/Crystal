import { uuidv7, type ErrorCode } from '@crystal/shared'

/** An error response from the API (`{ error: { code, message, details } }`). */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: unknown
  signal?: AbortSignal
}

/**
 * Identifies this browser tab. The server announces changes to every open app
 * except the tab that made them, which already shows them. (Not
 * `crypto.randomUUID()`: that needs HTTPS, and home servers often run without.)
 */
export const CLIENT_ID = uuidv7()

/** Calls `/api/v1{path}`. Resolves with the parsed JSON (or undefined for 204). */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal } = options
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        'X-Crystal-Client': CLIENT_ID,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(0, 'network', 'Network request failed')
  }

  if (response.status === 204) return undefined as T

  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string; details?: unknown } })
      ?.error
    throw new ApiError(
      response.status,
      (error?.code as ErrorCode | undefined) ?? 'internal_error',
      error?.message ?? response.statusText,
      error?.details,
    )
  }
  return payload as T
}

/** Uploads `multipart/form-data` (files) to `/api/v1{path}`. */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  method: 'POST' | 'PUT' = 'POST',
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/v1${path}`, {
      method,
      credentials: 'same-origin',
      headers: { 'X-Crystal-Client': CLIENT_ID },
      body: form,
    })
  } catch {
    throw new ApiError(0, 'network', 'Network request failed')
  }
  const payload: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const error = (payload as { error?: { code?: string; message?: string } })?.error
    throw new ApiError(
      response.status,
      (error?.code as ErrorCode | undefined) ??
        (response.status === 413 ? 'payload_too_large' : 'internal_error'),
      error?.message ?? response.statusText,
    )
  }
  return payload as T
}

/** Field-level validation problems reported by the server. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'validation_failed') return {}
  const details = Array.isArray(error.details) ? error.details : []
  const result: Record<string, string> = {}
  for (const detail of details as { path?: string; message?: string }[]) {
    if (detail.path && detail.message && !(detail.path in result)) {
      result[detail.path] = detail.message
    }
  }
  return result
}
