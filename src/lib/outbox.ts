// A queue on this phone (IndexedDB) for text messages that have not reached the server yet.
// Each message gets its own id before it is sent, so sending it twice can never create a duplicate.
export type OutItem = {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  queued_at: string
  status: 'sending' | 'failed'
  error?: string
}

const DB_NAME = 'songjog-outbox'
const STORE = 'items'
const memory = new Map<string, OutItem>() // used only if IndexedDB is blocked (for example in private mode)

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') { reject(new Error('IndexedDB is not available')); return }
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }) }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb()
  return new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode)
    const rq = fn(t.objectStore(STORE))
    t.oncomplete = () => { db.close(); resolve(rq.result) }
    t.onerror = () => { db.close(); reject(t.error) }
    t.onabort = () => { db.close(); reject(t.error) }
  })
}

export async function outboxPut(item: OutItem): Promise<void> {
  memory.set(item.id, item)
  try { await run('readwrite', (s) => s.put(item)) } catch { /* the in-memory copy is kept */ }
}

export async function outboxDelete(id: string): Promise<void> {
  memory.delete(id)
  try { await run('readwrite', (s) => s.delete(id)) } catch { /* ignore */ }
}

// Only this person's queued messages. Leftovers from another account on the same phone are removed.
export async function outboxAll(uid: string): Promise<OutItem[]> {
  let all: OutItem[]
  try { all = await run<OutItem[]>('readonly', (s) => s.getAll()) } catch { all = Array.from(memory.values()) }
  for (const i of all) if (i.sender_id !== uid) await outboxDelete(i.id)
  return all.filter((i) => i.sender_id === uid).sort((a, b) => a.queued_at.localeCompare(b.queued_at))
}

export async function outboxCount(): Promise<number> {
  try { return (await run<OutItem[]>('readonly', (s) => s.getAll())).length } catch { return memory.size }
}

export async function outboxClear(): Promise<void> {
  memory.clear()
  try { await run('readwrite', (s) => s.clear()) } catch { /* ignore */ }
}
