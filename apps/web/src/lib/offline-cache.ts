import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client'

/*
 * Keeps a copy of the app's data (lists, tasks, …) and of changes made
 * offline in IndexedDB, so Crystal opens without a connection and sends the
 * changes once it is back. Signing out deletes the copy.
 */

const DATABASE = 'crystal'
const STORE = 'cache'
const KEY = 'queries'
/** Writes are bundled: at most one per second. */
const WRITE_DELAY_MS = 1000

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB is not available'))
  })
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const database = await openDatabase()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE, mode)
      const request = action(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB failed'))
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB aborted'))
    })
  } finally {
    database.close()
  }
}

let pending: PersistedClient | undefined
let timer: ReturnType<typeof setTimeout> | undefined

function flush(): Promise<void> {
  clearTimeout(timer)
  timer = undefined
  const client = pending
  pending = undefined
  if (!client) return Promise.resolve()
  return run('readwrite', (store) => store.put(client, KEY)).then(
    () => undefined,
    // A full or blocked database only costs offline use; the app keeps working.
    () => undefined,
  )
}

export const offlineCache: Persister = {
  persistClient(client) {
    pending = client
    timer ??= setTimeout(() => void flush(), WRITE_DELAY_MS)
  },
  async restoreClient() {
    try {
      return await run(
        'readonly',
        (store) => store.get(KEY) as IDBRequest<PersistedClient | undefined>,
      )
    } catch {
      return undefined
    }
  },
  async removeClient() {
    clearTimeout(timer)
    timer = undefined
    pending = undefined
    try {
      await run('readwrite', (store) => store.delete(KEY))
    } catch {
      // Nothing stored, or storage unavailable: nothing to delete.
    }
  },
}

// Changes made just before closing the tab still get written.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => void flush())
}
