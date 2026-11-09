import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Online status (Supabase Realtime Presence) and "last seen".
// Online = the app is open and on screen on at least one device. Last seen uses the server time.
export type Presence = {
  online: Record<string, boolean>
  lastSeen: Record<string, string>
  showOnline: boolean
  showLast: boolean
}

let state: Presence = { online: {}, lastSeen: {}, showOnline: true, showLast: true }
const listeners = new Set<(s: Presence) => void>()
function set(patch: Partial<Presence>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l(state))
}

let channel: any = null
let uidNow = ''
let subscribed = false
let tracking = false
let timer: number | undefined
let removeListeners: (() => void) | null = null
const asked = new Map<string, number>() // when we last asked for someone's last seen
const waiting = new Set<string>() // asked for before presence had started: sent as soon as it starts

const visible = () => document.visibilityState === 'visible'

async function touch() {
  try { await supabase?.rpc('touch_last_seen') } catch { /* ignore */ }
}

// Track presence only while the app is on screen and the person allows it
async function syncTracking() {
  if (!channel || !subscribed) return
  const want = visible() && state.showOnline
  try {
    if (want && !tracking) { await channel.track({ at: Date.now() }); tracking = true }
    else if (!want && tracking) { await channel.untrack(); tracking = false }
  } catch { /* tried again on the next change */ }
}

export async function requestLastSeen(ids: string[]) {
  const sb = supabase
  if (!sb || !ids.length) return
  if (!uidNow) { ids.forEach((i) => waiting.add(i)); return }
  const now = Date.now()
  const fresh = ids.filter((id) => now - (asked.get(id) ?? 0) > 20000)
  if (!fresh.length) return
  fresh.forEach((id) => asked.set(id, now))
  try {
    const { data, error } = await sb.rpc('get_last_seen', { ids: fresh })
    if (error || !data) return
    const next = { ...state.lastSeen }
    for (const r of data as { user_id: string; last_seen_at: string }[]) next[r.user_id] = r.last_seen_at
    set({ lastSeen: next })
  } catch { /* offline */ }
}

export async function startPresence(uid: string) {
  const sb = supabase
  if (!sb || uidNow === uid) return
  stopPresence()
  uidNow = uid
  try {
    const { data } = await sb.from('user_status').select('show_online, show_last_seen').eq('user_id', uid).maybeSingle()
    if (uidNow !== uid) return
    set({ showOnline: data?.show_online !== false, showLast: data?.show_last_seen !== false })
  } catch { /* keep the defaults */ }

  const ch = sb.channel('presence:songjog', { config: { presence: { key: uid } } })
  channel = ch
  ch.on('presence', { event: 'sync' }, () => {
    const s = ch.presenceState() as Record<string, unknown[]>
    const online: Record<string, boolean> = {}
    for (const k of Object.keys(s)) if (s[k].length) online[k] = true
    set({ online })
  })
  ch.on('presence', { event: 'leave' }, (p: { key: string }) => {
    asked.delete(p.key)
    window.setTimeout(() => requestLastSeen([p.key]), 2500)
  })
  ch.subscribe((status: string) => {
    if (status === 'SUBSCRIBED') { subscribed = true; tracking = false; syncTracking() }
    else if (status === 'CLOSED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') { subscribed = false; tracking = false }
  })

  const onVis = () => { if (!visible()) touch(); syncTracking() }
  const onNet = () => { tracking = false; syncTracking() }
  document.addEventListener('visibilitychange', onVis)
  window.addEventListener('pagehide', touch)
  window.addEventListener('online', onNet)
  touch()
  if (waiting.size) { const early = Array.from(waiting); waiting.clear(); requestLastSeen(early) }
  timer = window.setInterval(() => { if (visible()) touch() }, 300000) // every 5 minutes while open
  removeListeners = () => {
    document.removeEventListener('visibilitychange', onVis)
    window.removeEventListener('pagehide', touch)
    window.removeEventListener('online', onNet)
  }
}

export function stopPresence() {
  if (timer) window.clearInterval(timer)
  timer = undefined
  if (removeListeners) removeListeners()
  removeListeners = null
  if (channel && supabase) { try { supabase.removeChannel(channel) } catch { /* ignore */ } }
  channel = null
  subscribed = false
  tracking = false
  uidNow = ''
  asked.clear()
  set({ online: {}, lastSeen: {} })
}

export async function setPresencePrefs(p: { showOnline?: boolean; showLast?: boolean }) {
  const sb = supabase
  if (!sb || !uidNow) return
  const patch: Record<string, boolean> = {}
  if (p.showOnline !== undefined) patch.show_online = p.showOnline
  if (p.showLast !== undefined) patch.show_last_seen = p.showLast
  const before = { showOnline: state.showOnline, showLast: state.showLast }
  set({
    ...(p.showOnline !== undefined ? { showOnline: p.showOnline } : {}),
    ...(p.showLast !== undefined ? { showLast: p.showLast } : {}),
  })
  syncTracking()
  const { error } = await sb.from('user_status').update(patch).eq('user_id', uidNow)
  if (error) { set(before); syncTracking() }
}

export function usePresence(): Presence {
  const [s, setS] = useState(state)
  useEffect(() => {
    listeners.add(setS)
    setS(state)
    return () => { listeners.delete(setS) }
  }, [])
  return s
}
