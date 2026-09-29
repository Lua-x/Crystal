import { AsyncLocalStorage } from 'node:async_hooks'

import { inArray } from 'drizzle-orm'

import type { Db } from '../db/client.js'
import { listMembers } from '../db/schema.js'

/**
 * Something the client should reload: the lists and tasks of `lists` (or, for
 * personal changes such as sidebar order, just the sidebar).
 */
export interface ChangeEvent {
  type: 'changed'
  lists: string[]
}

interface Subscriber {
  userId: string
  /** The browser tab (see `X-Crystal-Client`), so it does not hear its own changes. */
  client: string | undefined
  send: (event: ChangeEvent) => void
  close: () => void
}

/** How a browser tab identifies itself (`X-Crystal-Client`, `?client=`). */
export const CLIENT_ID_PATTERN = /^[\w-]{8,64}$/

/** The tab that sent the current request; changes are not echoed back to it. */
const origin = new AsyncLocalStorage<string | undefined>()

export function runWithOrigin<T>(client: string | undefined, callback: () => T): T {
  return origin.run(client, callback)
}

/**
 * Live updates for open apps. Every change is announced to the members of the
 * lists it touched, over their open event streams. Everything lives in this
 * process, which fits Crystal's single-container design.
 */
export class EventHub {
  private readonly subscribers = new Set<Subscriber>()

  constructor(private readonly db: Db) {}

  subscribe(subscriber: Subscriber): () => void {
    this.subscribers.add(subscriber)
    return () => this.subscribers.delete(subscriber)
  }

  get connections(): number {
    return this.subscribers.size
  }

  /** Tells every member of `listIds` (and `alsoNotify`) that these lists changed. */
  listsChanged(listIds: readonly string[], alsoNotify: readonly string[] = []): void {
    const lists = [...new Set(listIds)]
    const members =
      lists.length > 0
        ? this.db
            .select({ userId: listMembers.userId })
            .from(listMembers)
            .where(inArray(listMembers.listId, lists))
            .all()
            .map((row) => row.userId)
        : []
    this.publish([...members, ...alsoNotify], { type: 'changed', lists })
  }

  /** A change only its author sees (sidebar order, groups): their other tabs reload. */
  personalChange(userId: string): void {
    this.publish([userId], { type: 'changed', lists: [] })
  }

  /** Ends every stream, e.g. on shutdown; clients reconnect on their own. */
  closeAll(): void {
    for (const subscriber of this.subscribers) subscriber.close()
    this.subscribers.clear()
  }

  private publish(userIds: readonly string[], event: ChangeEvent): void {
    if (this.subscribers.size === 0 || userIds.length === 0) return
    const recipients = new Set(userIds)
    const sender = origin.getStore()
    for (const subscriber of this.subscribers) {
      if (!recipients.has(subscriber.userId)) continue
      if (sender && subscriber.client === sender) continue
      subscriber.send(event)
    }
  }
}
