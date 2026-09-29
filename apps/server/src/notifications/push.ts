import { createECDH } from 'node:crypto'
import https from 'node:https'

import webpush from 'web-push'

import { deriveKey } from '../lib/crypto.js'
import { assertAllowedHost, DeliveryError, guardedLookup, toDeliveryError } from './network.js'

export interface VapidKeys {
  /** Uncompressed P-256 public key, base64url – what browsers need to subscribe. */
  publicKey: string
  privateKey: string
}

/**
 * Derives the VAPID key pair from the instance secret, so nothing extra has to
 * be stored or configured. Changing `SECRET_KEY` changes the keys, and browsers
 * then have to subscribe again (the web app does that on its own).
 */
export function deriveVapidKeys(secret: string): VapidKeys {
  // A random 32-byte value is a valid P-256 private key with overwhelming
  // probability; the counter only guards against the astronomically rare miss.
  for (let attempt = 0; ; attempt++) {
    const privateKey = deriveKey(secret, attempt === 0 ? 'web-push' : `web-push-${attempt}`)
    const ecdh = createECDH('prime256v1')
    try {
      ecdh.setPrivateKey(privateKey)
    } catch {
      continue
    }
    return {
      publicKey: ecdh.getPublicKey().toString('base64url'),
      privateKey: privateKey.toString('base64url'),
    }
  }
}

export interface PushTarget {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** Delivers an encrypted Web Push message; throws a `DeliveryError` (`gone` for expired subscriptions). */
export interface PushSender {
  send(target: PushTarget, payload: string): Promise<void>
}

export interface WebPushOptions {
  keys: VapidKeys
  /** Contact for push services: an `https:` URL or `mailto:` address. */
  subject: string
  allowPrivate: boolean
}

/** One day: a reminder that arrives later than that is no longer useful. */
const TTL_SECONDS = 24 * 60 * 60

export function createWebPushSender(options: WebPushOptions): PushSender {
  const agent = new https.Agent({ lookup: guardedLookup(options.allowPrivate) })
  return {
    async send(target, payload) {
      assertAllowedHost(new URL(target.endpoint), options.allowPrivate)
      try {
        await webpush.sendNotification(target, payload, {
          vapidDetails: { subject: options.subject, ...options.keys },
          TTL: TTL_SECONDS,
          urgency: 'high',
          contentEncoding: 'aes128gcm',
          timeout: 10_000,
          agent,
        })
      } catch (error) {
        if (error instanceof webpush.WebPushError) {
          // The browser unsubscribed or the subscription expired.
          if (error.statusCode === 404 || error.statusCode === 410) throw new DeliveryError('gone')
          throw new DeliveryError(`http:${error.statusCode}`)
        }
        throw toDeliveryError(error)
      }
    },
  }
}
