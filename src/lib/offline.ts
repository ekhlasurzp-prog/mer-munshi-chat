// Saves the latest chats and message TEXT on this device so they can be read offline.
// Cleared when the person signs out or deletes the account.
const KEY = 'mmc-cache-v1'

export type Snapshot = {
  uid: string
  convs: any[]
  msgs: any[]
  nicks: Record<string, string>
  peerRead: Record<string, string>
  anns: any[]
  contacts?: any[]
  joined?: string
  welcome?: string
}

export function readCache(): Snapshot | null {
  try {
    const s = localStorage.getItem(KEY)
    return s ? (JSON.parse(s) as Snapshot) : null
  } catch { return null }
}

export function writeCache(snap: Snapshot) {
  try {
    const msgs = snap.msgs.slice(-400).map((m) => ({
      ...m,
      body: typeof m.body === 'string' && m.body.length > 2000 ? m.body.slice(0, 2000) : m.body,
    }))
    localStorage.setItem(KEY, JSON.stringify({ ...snap, msgs }))
  } catch { /* storage full or blocked: skip */ }
}

export function clearCache() {
  try {
    localStorage.removeItem(KEY)
    localStorage.removeItem('mmc-dismissed')
    Object.keys(localStorage).filter((k) => k.startsWith('mmc-ai-')).forEach((k) => localStorage.removeItem(k))
  } catch { /* ignore */ }
}
