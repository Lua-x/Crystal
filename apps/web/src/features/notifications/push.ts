import type { PushStatus } from '@crystal/shared'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'

import { api } from '../../lib/api'
import { SERVICE_WORKER_URL } from '../../lib/service-worker'
import { notificationKeys, pushStatusQuery } from './data'

export type PushSupport = 'supported' | 'unsupported' | 'insecure'

export function pushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported'
  // Browsers only offer push (and service workers) on HTTPS or localhost.
  if (!window.isSecureContext) return 'insecure'
  if (
    !('serviceWorker' in navigator) ||
    !('PushManager' in window) ||
    !('Notification' in window)
  ) {
    return 'unsupported'
  }
  return 'supported'
}

export class PushPermissionError extends Error {
  constructor(readonly permission: NotificationPermission) {
    super(`Notification permission: ${permission}`)
    this.name = 'PushPermissionError'
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '='))
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function sameKey(key: ArrayBuffer | null, publicKey: string): boolean {
  if (!key) return false
  const expected = base64UrlToBytes(publicKey)
  const actual = new Uint8Array(key)
  return (
    actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
  )
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const registration = await navigator.serviceWorker.getRegistration('/')
  return (await registration?.pushManager.getSubscription()) ?? null
}

/** Asks for permission, subscribes this browser and registers it with the server. */
async function subscribe(publicKey: string): Promise<string> {
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new PushPermissionError(permission)
  await navigator.serviceWorker.register(SERVICE_WORKER_URL, { scope: '/' })
  const registration = await navigator.serviceWorker.ready
  let subscription = await registration.pushManager.getSubscription()
  // Made with another server key (the instance's secret changed): start over.
  if (subscription && !sameKey(subscription.options.applicationServerKey, publicKey)) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  })
  const { endpoint, keys } = subscription.toJSON()
  await api<void>('/notifications/push', { method: 'POST', body: { endpoint, keys } })
  return subscription.endpoint
}

export interface PushState {
  support: PushSupport
  permission: NotificationPermission | undefined
  /** This browser's subscription, if the server knows it. */
  device: PushStatus['devices'][number] | undefined
  status: PushStatus | undefined
  enable: () => Promise<void>
  disable: () => Promise<void>
}

/** Push for this browser: whether it is on, and turning it on or off. */
export function usePushState(): PushState {
  const queryClient = useQueryClient()
  const support = pushSupport()
  const { data: status } = useQuery({ ...pushStatusQuery, enabled: support === 'supported' })
  const [endpoint, setEndpoint] = useState<string | null>()
  const [permission, setPermission] = useState<NotificationPermission | undefined>(() =>
    support === 'supported' ? Notification.permission : undefined,
  )

  useEffect(() => {
    if (support !== 'supported') return
    let active = true
    void currentSubscription().then((subscription) => {
      if (active) setEndpoint(subscription?.endpoint ?? null)
    })
    return () => {
      active = false
    }
  }, [support])

  const enable = useCallback(async () => {
    if (!status) return
    try {
      setEndpoint(await subscribe(status.publicKey))
    } finally {
      setPermission(Notification.permission)
      await queryClient.invalidateQueries({ queryKey: notificationKeys.push })
    }
  }, [queryClient, status])

  const disable = useCallback(async () => {
    const subscription = await currentSubscription()
    const device = status?.devices.find((item) => item.endpoint === subscription?.endpoint)
    if (device) await api<void>(`/notifications/push/${device.id}`, { method: 'DELETE' })
    await subscription?.unsubscribe()
    setEndpoint(null)
    await queryClient.invalidateQueries({ queryKey: notificationKeys.push })
  }, [queryClient, status])

  return {
    support,
    permission,
    device: endpoint ? status?.devices.find((item) => item.endpoint === endpoint) : undefined,
    status,
    enable,
    disable,
  }
}
