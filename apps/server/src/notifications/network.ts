import { lookup as dnsLookup, type LookupAddress } from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

/**
 * Notification services are configured by users, so the server must not become
 * a tool to reach places it should not (SSRF). Requests go to http(s) only,
 * never follow redirects, time out, and their responses are never shown. Some
 * addresses are always off limits; private networks – where self-hosted ntfy,
 * Gotify or Apprise usually live – can be blocked with `NOTIFY_PRIVATE_NETWORKS`.
 */

/** Unspecified, link-local (including cloud metadata services), multicast and reserved. */
const ALWAYS_BLOCKED = new BlockList()
ALWAYS_BLOCKED.addSubnet('0.0.0.0', 8, 'ipv4')
ALWAYS_BLOCKED.addSubnet('169.254.0.0', 16, 'ipv4')
ALWAYS_BLOCKED.addSubnet('224.0.0.0', 3, 'ipv4')
ALWAYS_BLOCKED.addAddress('::', 'ipv6')
ALWAYS_BLOCKED.addSubnet('fe80::', 10, 'ipv6')
ALWAYS_BLOCKED.addSubnet('ff00::', 8, 'ipv6')

/** Loopback, private and shared (carrier-grade NAT, e.g. Tailscale) ranges. */
const PRIVATE = new BlockList()
PRIVATE.addSubnet('127.0.0.0', 8, 'ipv4')
PRIVATE.addSubnet('10.0.0.0', 8, 'ipv4')
PRIVATE.addSubnet('172.16.0.0', 12, 'ipv4')
PRIVATE.addSubnet('192.168.0.0', 16, 'ipv4')
PRIVATE.addSubnet('100.64.0.0', 10, 'ipv4')
PRIVATE.addAddress('::1', 'ipv6')
PRIVATE.addSubnet('fc00::', 7, 'ipv6')

/** Why a delivery failed, as a stable code the web app translates (`http:<status>` for HTTP errors). */
export type DeliveryFailure =
  'config' | 'blocked' | 'dns' | 'unreachable' | 'timeout' | 'smtp' | 'gone' | `http:${number}`

export class DeliveryError extends Error {
  constructor(readonly reason: DeliveryFailure) {
    super(`Delivery failed: ${reason}`)
    this.name = 'DeliveryError'
  }
}

/** Whether requests may go to `address` (IPv4-mapped IPv6 addresses count as IPv4). */
export function isAllowedAddress(address: string, allowPrivate: boolean): boolean {
  const family = isIP(address) === 6 ? 'ipv6' : 'ipv4'
  if (ALWAYS_BLOCKED.check(address, family)) return false
  return allowPrivate || !PRIVATE.check(address, family)
}

/**
 * Resolves host names like the system does, but only hands out allowed
 * addresses. Checking at connection time (instead of before the request) also
 * defeats DNS rebinding.
 */
export function guardedLookup(allowPrivate: boolean): LookupFunction {
  return (hostname, options, callback) => {
    dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
      if (error) {
        callback(error, '', 0)
        return
      }
      const allowed = addresses.filter((entry) => isAllowedAddress(entry.address, allowPrivate))
      const first = allowed[0]
      if (!first) {
        callback(new DeliveryError('blocked'), '', 0)
        return
      }
      if (options.all) callback(null, allowed)
      else callback(null, first.address, first.family)
    })
  }
}

/** Rejects URLs whose host is a literal IP address that is not allowed (no lookup happens for those). */
export function assertAllowedHost(url: URL, allowPrivate: boolean): void {
  const host = url.hostname.replace(/^\[|\]$/g, '')
  if (isIP(host) && !isAllowedAddress(host, allowPrivate)) throw new DeliveryError('blocked')
}

export interface NetworkPolicy {
  allowPrivate: boolean
  userAgent: string
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000

/** Sends a JSON body with POST. Resolves on any 2xx answer; the response body is discarded. */
export function postJson(
  url: string,
  body: unknown,
  headers: Record<string, string>,
  policy: NetworkPolicy,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let target: URL
    try {
      target = new URL(url)
      if (target.protocol !== 'http:' && target.protocol !== 'https:') {
        throw new DeliveryError('blocked')
      }
      assertAllowedHost(target, policy.allowPrivate)
    } catch (error) {
      reject(error instanceof DeliveryError ? error : new DeliveryError('blocked'))
      return
    }

    const payload = JSON.stringify(body)
    const request = (target.protocol === 'https:' ? https : http).request(
      target,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(payload)),
          'user-agent': policy.userAgent,
          ...headers,
        },
        lookup: guardedLookup(policy.allowPrivate),
        signal: AbortSignal.timeout(policy.timeoutMs ?? DEFAULT_TIMEOUT_MS),
        // A fresh connection per request, so every one passes the address check.
        agent: false,
      },
      (response) => {
        // Nothing from the response is used or shown; redirects are not followed.
        response.resume()
        const status = response.statusCode ?? 0
        if (status >= 200 && status < 300) resolve()
        else reject(new DeliveryError(`http:${status}`))
      },
    )
    request.on('error', (error) => reject(toDeliveryError(error)))
    request.end(payload)
  })
}

/** Maps network errors to a reason code without exposing details about the target. */
export function toDeliveryError(error: unknown): DeliveryError {
  if (error instanceof DeliveryError) return error
  const cause = (error as { cause?: unknown }).cause
  if (cause instanceof DeliveryError) return cause
  const name = (error as { name?: string }).name
  const code = (error as { code?: string }).code
  if (name === 'AbortError' || name === 'TimeoutError' || code === 'ETIMEDOUT') {
    return new DeliveryError('timeout')
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return new DeliveryError('dns')
  return new DeliveryError('unreachable')
}
