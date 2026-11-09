import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Logo from '../components/Logo'
import Avatar from '../components/Avatar'
import StatusDot from '../components/StatusDot'
import { requestLastSeen, usePresence } from '../lib/presence'
import { useAiChat } from '../lib/ai'
import GeminiPane from '../components/GeminiPane'
import { outboxAll, outboxClear, outboxDelete, outboxPut } from '../lib/outbox'
import type { OutItem } from '../lib/outbox'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'
import { clearCache, readCache, writeCache } from '../lib/offline'

type Msg = {
  id: string; conversation_id: string; sender_id: string; body: string | null
  created_at: string; deleted_at: string | null
  attachment_path: string | null; attachment_name: string | null; attachment_type: string | null
}
type Row = Msg & { _pending?: 'sending' | 'failed' }
type Conv = { id: string; type: string; username: string; peerId: string | null; avatar: string | null; lastRead: string }
type Found = { id: string; username: string; avatar_path: string | null }
type Reacts = Record<string, Record<string, string>>
type Ann = { id: string; body: string; created_at: string }
type Contact = { id: string; username: string; avatar: string | null }
const OFFICIAL = 'official'
const GEMINI = 'gemini'
const readSeen = () => { try { return localStorage.getItem('mmc-official-seen') || '' } catch { return '' } }
const fmtDate = (s: string) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const OFFLINE_MSG = 'Photos and voice notes need internet.'

const COLS = 'id,conversation_id,sender_id,body,created_at,deleted_at,attachment_path,attachment_name,attachment_type'
const EMOJIS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}']
const HEART = EMOJIS[1]
const MAX_IMAGE = 10 * 1024 * 1024 // 10 MB
const MAX_VOICE_SECONDS = 30
const LONG_TEXT = 300
const fmt = (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const nice = (m: string) =>
  /row-level security/i.test(m) ? 'Could not send. The chat may have been deleted, or sending is blocked.' : m

const OnlineDot = () => (
  <span role="img" aria-label="Online" title="Online" className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
)

// "today 3:40 PM", "yesterday 3:40 PM" or "Nov 7, 3:40 PM"
const fmtSeen = (iso: string) => {
  const d = new Date(iso)
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const day = new Date(); day.setHours(0, 0, 0, 0)
  const diff = Math.round((day.getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000)
  if (diff <= 0) return `today ${time}`
  if (diff === 1) return `yesterday ${time}`
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${time}`
}

const PlaneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M2.5 11.2 20.8 3.6c.8-.3 1.5.4 1.2 1.2L14.4 21c-.4.8-1.5.8-1.8 0l-2.2-5.6-5.6-2.2c-.8-.3-.8-1.4-.3-2Z" />
  </svg>
)

const svgp = { viewBox: '0 0 24 24', width: 24, height: 24, fill: 'currentColor', 'aria-hidden': true } as const
const ChatIcon = () => (<svg {...svgp}><path d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /></svg>)
const PeopleIcon = () => (<svg {...svgp}><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.6 3-6 7-6s7 2.4 7 6z" /><circle cx="17.5" cy="9" r="2.5" /><path d="M17.5 14c3 0 4.5 2 4.5 5h-4c0-2-.4-3.6-1.2-4.8z" /></svg>)
const BellIcon = () => (<svg {...svgp}><path d="M12 22a2.5 2.5 0 0 0 2.4-2H9.6A2.5 2.5 0 0 0 12 22z" /><path d="M18 16V11a6 6 0 0 0-4.5-5.8V4.5a1.5 1.5 0 0 0-3 0v.7A6 6 0 0 0 6 11v5l-2 2v1h16v-1z" /></svg>)
const UserIcon = () => (<svg {...svgp}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z" /></svg>)
const NewChatIcon = () => (<svg {...svgp}><path fillRule="evenodd" d="M4 3h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4v-4H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm9 3h-2v3H8v2h3v3h2v-3h3V9h-3z" /></svg>)
const SparkIcon = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden>
    <defs><linearGradient id="sparkg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#1E90FF" /></linearGradient></defs>
    <path fill="url(#sparkg)" d="M12 2l2.2 6.3L21 10.5l-6.8 2.2L12 20l-2.2-7.3L3 10.5l6.8-2.2z" />
    <path fill="url(#sparkg)" d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
  </svg>
)

// Long messages are shortened with a "See more" toggle
function Body({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  if (text.length <= LONG_TEXT) return <p className="whitespace-pre-wrap break-words">{text}</p>
  return (
    <p className="whitespace-pre-wrap break-words">
      {open ? text : text.slice(0, LONG_TEXT) + '...'}{' '}
      <button type="button" className="font-semibold underline"
        onClick={(e) => { e.stopPropagation(); setOpen(!open) }}>
        {open ? 'See less' : 'See more'}
      </button>
    </p>
  )
}

// Private files are shown through short-lived signed links
function Attach({ path, type }: { path: string; type: string | null }) {
  const [url, setUrl] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let ok = true
    setFailed(false)
    Promise.resolve(supabase?.storage.from('attachments').createSignedUrl(path, 3600))
      .then((r) => {
        if (!ok) return
        if (r?.data) setUrl(r.data.signedUrl); else setFailed(true)
      })
      .catch(() => { if (ok) setFailed(true) })
    return () => { ok = false }
  }, [path])
  const audio = type?.startsWith('audio/')
  if (failed) return <p className="text-xs opacity-70">{audio ? 'Voice message' : 'Photo'} (needs internet)</p>
  if (!url) return <p className="text-xs opacity-70">Loading...</p>
  if (audio) return <audio controls src={url} className="max-w-full" />
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Photo" className="max-h-64 rounded-lg" /></a>
}

export default function ChatShell() {
  const [me, setMe] = useState<string | null>(null)
  const [convs, setConvs] = useState<Conv[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [peerRead, setPeerRead] = useState<Record<string, string>>({})
  const [nicks, setNicks] = useState<Record<string, string>>({})
  const [blocked, setBlocked] = useState<Record<string, boolean>>({})
  const [reactions, setReactions] = useState<Reacts>({})
  const [retention, setRetention] = useState<number | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [menu, setMenu] = useState(false)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [err, setErr] = useState('')
  const [recording, setRecording] = useState(false)
  const [recSec, setRecSec] = useState(0)
  const [anns, setAnns] = useState<Ann[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [joined, setJoined] = useState('')
  const [welcome, setWelcome] = useState('')
  const [seenAt, setSeenAt] = useState(readSeen)
  const [tab, setTab] = useState<'chats' | 'contacts'>('chats')
  const [pending, setPending] = useState<OutItem[]>([])
  const [visible, setVisible] = useState(true)
  const [topMenu, setTopMenu] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const brand = useBrand()
  const pres = usePresence()
  const ai = useAiChat(me)
  const bottom = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const convsRef = useRef<Conv[]>([])
  const activeRef = useRef<string | null>(null)
  const meRef = useRef<string | null>(null)
  const lastMarked = useRef<Record<string, string>>({})
  const flushing = useRef(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const recChunks = useRef<Blob[]>([])
  const recCancelled = useRef(false)
  const recTimer = useRef<number | undefined>(undefined)
  convsRef.current = convs
  activeRef.current = active
  meRef.current = me

  // Phone Back button: opening a chat adds one history step, Back closes it
  const pushed = useRef(false)
  function openPane(id: string) {
    if (!pushed.current) { window.history.pushState({ mmc: 1 }, ''); pushed.current = true }
    setActive(id)
  }
  function closePane() {
    if (pushed.current) window.history.back()
    else setActive(null)
  }
  useEffect(() => {
    const onPop = () => { pushed.current = false; setActive(null); setMenu(false); setSel(null) }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])
  useEffect(() => {
    // The chat was closed another way (for example deleted): drop the extra history step
    if (active === null && pushed.current) { pushed.current = false; window.history.back() }
  }, [active])

  const loadAll = useCallback(async (uid: string) => {
    const sb = supabase
    if (!sb) return
    try {
      const { data: mem, error: memErr } = await sb.from('conversation_members')
        .select('conversation_id, last_read_at, conversations(id,type,title)').eq('user_id', uid)
      if (memErr || !mem) { setOnline(false); return } // no connection: keep the saved copy
      const rows = mem as any[]
      const ids = rows.map((r) => r.conversation_id)
      const peer: Record<string, { id: string; username: string; avatar: string | null; read: string }> = {}
      if (ids.length) {
        const { data: others } = await sb.from('conversation_members')
          .select('conversation_id, user_id, last_read_at, profiles(username, avatar_path)')
          .in('conversation_id', ids).neq('user_id', uid)
        for (const o of (others ?? []) as any[]) {
          if (!peer[o.conversation_id]) {
            peer[o.conversation_id] = {
              id: o.user_id, username: o.profiles?.username ?? 'user',
              avatar: o.profiles?.avatar_path ?? null, read: o.last_read_at,
            }
          }
        }
      }
      const pr: Record<string, string> = {}
      const convList: Conv[] = rows.map((r) => {
        const c = r.conversations
        const p = peer[r.conversation_id]
        const direct = c?.type !== 'group'
        if (direct && p) pr[r.conversation_id] = p.read
        return {
          id: r.conversation_id, type: c?.type ?? 'direct',
          username: direct ? (p?.username ?? 'user') : (c.title ?? 'Group'),
          peerId: direct ? (p?.id ?? null) : null,
          avatar: direct ? (p?.avatar ?? null) : null,
          lastRead: r.last_read_at,
        }
      })

      const [m, n, b, rx, ret, an, pf, wl, ct, ad] = await Promise.all([
        sb.from('messages').select(COLS).order('created_at', { ascending: false }).limit(500),
        sb.from('nicknames').select('target_id, nickname').eq('owner_id', uid),
        sb.from('blocks').select('blocked_id').eq('blocker_id', uid),
        sb.from('reactions').select('message_id, user_id, emoji').limit(3000),
        sb.rpc('get_retention'),
        sb.from('announcements').select('id, body, created_at').order('created_at', { ascending: false }).limit(30),
        sb.from('profiles').select('created_at').eq('id', uid).maybeSingle(),
        sb.rpc('get_welcome'),
        sb.from('contacts').select('contact_id').eq('owner_id', uid),
        sb.rpc('am_i_admin'),
      ])
      if (m.error) { setOnline(false); return }
      const msgList = ((m.data ?? []) as Msg[]).reverse()
      const nk: Record<string, string> = {}
      for (const x of (n.data ?? []) as any[]) nk[x.target_id] = x.nickname
      const bk: Record<string, boolean> = {}
      for (const x of (b.data ?? []) as any[]) bk[x.blocked_id] = true
      const rr: Reacts = {}
      for (const x of (rx.data ?? []) as any[]) {
        if (!rr[x.message_id]) rr[x.message_id] = {}
        rr[x.message_id][x.user_id] = x.emoji
      }
      const annList = (an.data ?? []) as Ann[]
      let contactList: Contact[] = []
      const cids = ((ct.data ?? []) as any[]).map((x) => x.contact_id)
      if (cids.length) {
        const { data: cp } = await sb.from('profiles').select('id, username, avatar_path').in('id', cids)
        contactList = ((cp ?? []) as any[]).map((x) => ({ id: x.id, username: x.username, avatar: x.avatar_path }))
      }
      const joinedAt = (pf.data as any)?.created_at ?? ''
      const welcomeText = typeof wl.data === 'string' ? wl.data : ''

      setConvs(convList); setPeerRead(pr); setMsgs(msgList); setNicks(nk); setBlocked(bk)
      setReactions(rr); setAnns(annList); setContacts(contactList); setJoined(joinedAt); setWelcome(welcomeText)
      setRetention(typeof ret.data === 'number' ? ret.data : null)
      setIsAdmin(ad.data === true)
      setOnline(true)
      writeCache({
        uid, convs: convList, msgs: msgList, nicks: nk, peerRead: pr, anns: annList,
        contacts: contactList, joined: joinedAt, welcome: welcomeText,
      })
    } catch {
      setOnline(false)
    }
  }, [])

  // Start-up: show saved messages at once, check sign-in, load fresh data, listen for changes
  useEffect(() => {
    if (!supabase) { window.location.replace('#/login'); return }
    const sb = supabase
    let cancelled = false
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const cached = readCache()
      if (cached) {
        setMe(cached.uid); setConvs(cached.convs); setMsgs(cached.msgs)
        setNicks(cached.nicks); setPeerRead(cached.peerRead); setAnns(cached.anns)
        setContacts(cached.contacts ?? []); setJoined(cached.joined ?? ''); setWelcome(cached.welcome ?? '')
      }
      const { data, error } = await sb.auth.getUser()
      let uid = data.user?.id
      if (!uid) {
        const offlineNow = !navigator.onLine || (error && /fetch|network/i.test(error.message))
        if (offlineNow && cached) { uid = cached.uid; setOnline(false) } else {
          clearCache(); window.location.replace('#/login'); return
        }
      }
      if (cached && cached.uid !== uid) {
        clearCache(); setConvs([]); setMsgs([]); setNicks({}); setPeerRead({}); setAnns([])
        setContacts([]); setJoined(''); setWelcome('')
      }
      if (navigator.onLine) {
        const { data: p } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle()
        if (!p) { window.location.replace('#/onboarding'); return }
      }
      if (cancelled) return
      setMe(uid)
      setPending(await outboxAll(uid))
      await loadAll(uid)
      flushOutbox(uid)
      if (cancelled) return
      channel = sb.channel(`mmc-${uid}-${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
          const m = payload.new as Msg
          setMsgs((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
          if (!convsRef.current.some((c) => c.id === m.conversation_id)) loadAll(uid)
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (payload) => {
          const m = payload.new as Msg
          setMsgs((prev) => prev.map((x) => (x.id === m.id ? { ...x, ...m } : x)))
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (payload) => {
          if (payload.eventType === 'DELETE') return
          const r = payload.new as { message_id: string; user_id: string; emoji: string }
          setReactions((p0) => ({ ...p0, [r.message_id]: { ...(p0[r.message_id] ?? {}), [r.user_id]: r.emoji } }))
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, (payload) => {
          const a2 = payload.new as Ann
          setAnns((p0) => [a2, ...p0.filter((x) => x.id !== a2.id)].slice(0, 10))
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${uid}` },
          () => loadAll(uid))
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, (payload) => {
          const r = payload.new as { user_id: string; conversation_id: string; last_read_at: string }
          if (r.user_id !== uid) setPeerRead((p0) => ({ ...p0, [r.conversation_id]: r.last_read_at }))
        })
        .subscribe()
    })()
    return () => { cancelled = true; if (channel) sb.removeChannel(channel) }
  }, [loadAll])

  // Username search (min 2 characters)
  useEffect(() => {
    const clean = q.toLowerCase().replace(/[^a-z0-9_]/g, '')
    if (!supabase || !me || clean.length < 2) { setFound([]); return }
    const t = setTimeout(async () => {
      const { data } = await supabase!.from('profiles').select('id,username,avatar_path')
        .ilike('username', `%${clean}%`).neq('id', me).limit(10)
      setFound((data ?? []) as Found[])
    }, 300)
    return () => clearTimeout(t)
  }, [q, me])

  const serverThread = msgs.filter((m) => m.conversation_id === active)
  const pendingRows: Row[] = pending
    .filter((p) => p.conversation_id === active && !msgs.some((m) => m.id === p.id))
    .map((p) => ({
      id: p.id, conversation_id: p.conversation_id, sender_id: p.sender_id, body: p.body,
      created_at: p.queued_at, deleted_at: null, attachment_path: null, attachment_name: null,
      attachment_type: null, _pending: p.status,
    }))
  const thread: Row[] = [...serverThread, ...pendingRows]

  // The official chat from the app: welcome message + admin announcements (read only)
  const official = [
    ...(welcome ? [{ id: 'welcome', body: welcome, created_at: joined || '1970-01-01T00:00:00Z' }] : []),
    ...anns.filter((a) => !joined || new Date(a.created_at) >= new Date(joined)),
  ].sort((x, y) => new Date(x.created_at).getTime() - new Date(y.created_at).getTime())
  const officialUnread = official.filter((i) => !seenAt || new Date(i.created_at) > new Date(seenAt)).length
  useEffect(() => {
    if (active !== OFFICIAL || !official.length) return
    const last = official[official.length - 1].created_at
    setSeenAt(last)
    try { localStorage.setItem('mmc-official-seen', last) } catch { /* ignore */ }
  }, [active, official.length])

  // Refresh when the app comes back to the screen
  useEffect(() => {
    if (!me) return
    const on = () => {
      setVisible(document.visibilityState === 'visible')
      if (document.visibilityState === 'visible') { loadAll(me); flushOutbox(me) }
    }
    const goOnline = () => { setOnline(true); loadAll(me); flushOutbox(me) }
    const goOffline = () => setOnline(false)
    document.addEventListener('visibilitychange', on)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      document.removeEventListener('visibilitychange', on)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [me, loadAll])

  // Last seen of the people in my chats and contacts (one request for all of them)
  useEffect(() => {
    const ids = Array.from(new Set([...convs.map((c) => c.peerId), ...contacts.map((c) => c.id)]))
      .filter((x): x is string => !!x)
    if (ids.length && visible) requestLastSeen(ids)
  }, [convs.length, contacts.length, visible])

  // Keep trying to send queued messages while the app is open
  useEffect(() => {
    if (!me || !pending.some((p) => p.status === 'sending')) return
    const t = window.setInterval(() => flushOutbox(me), 15000)
    return () => window.clearInterval(t)
  }, [me, pending])

  // If the open chat no longer exists, go back to the list
  useEffect(() => {
    if (active && active !== OFFICIAL && active !== GEMINI && !convs.some((c) => c.id === active)) setActive(null)
  }, [convs, active])

  // Mark the open chat as read (newest message's server time) and scroll down
  useEffect(() => {
    if (!active || !me || !supabase) return
    bottom.current?.scrollIntoView({ block: 'end' })
    if (!visible) return // counts as read only while the chat is on screen
    const latest = serverThread[serverThread.length - 1]?.created_at
    if (!latest || lastMarked.current[active] === latest) return
    lastMarked.current[active] = latest
    setConvs((cs) => cs.map((c) => (c.id === active ? { ...c, lastRead: latest } : c)))
    supabase.from('conversation_members').update({ last_read_at: latest })
      .eq('conversation_id', active).eq('user_id', me).then(() => {})
  }, [active, me, thread.length, serverThread.length, visible])

  const nameOf = (c: Conv) => (c.peerId && nicks[c.peerId]) || c.username

  async function startChat(userId: string) {
    if (!supabase || !me) return
    setErr('')
    const { data, error } = await supabase.rpc('start_direct_chat', { other: userId })
    if (error) { setErr(nice(error.message)); return }
    await loadAll(me)
    setQ(''); setFound([]); setTab('chats')
    openPane(data as string)
  }

  async function addMessage(row: Record<string, unknown>) {
    if (!supabase) return false
    if (!navigator.onLine) { setErr(OFFLINE_MSG); return false }
    const { data, error } = await supabase.from('messages').insert(row).select(COLS).single()
    if (error) { setErr(nice(error.message)); return false }
    const m = data as Msg
    setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))
    return true
  }

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !active || !me) return
    setErr(''); setText('')
    // Saved on the phone first, so it is never lost. Red dot until the server confirms.
    const item: OutItem = {
      id: crypto.randomUUID(), conversation_id: active, sender_id: me, body,
      queued_at: new Date().toISOString(), status: 'sending',
    }
    setPending((p) => [...p, item])
    await outboxPut(item)
    flushOutbox(me)
  }

  function isTransient(er: { message?: string } | null) {
    return !navigator.onLine || /fetch|network|timeout|jwt|load failed/i.test(er?.message ?? '')
  }

  // Sends queued messages one by one, in order. The message id makes a second send harmless.
  async function flushOutbox(uidArg?: string) {
    const uid = uidArg ?? meRef.current
    const sb = supabase
    if (!sb || !uid || flushing.current) return
    flushing.current = true
    const sendAll = async () => {
      const items = (await outboxAll(uid)).filter((i) => i.status === 'sending')
      for (const it of items) {
        if (!navigator.onLine) break
        const { data, error } = await sb.from('messages')
          .insert({ id: it.id, conversation_id: it.conversation_id, sender_id: it.sender_id, body: it.body })
          .select(COLS).single()
        let saved = data as Msg | null
        if (error) {
          if (error.code === '23505') {
            // Already saved earlier: do not send it again
            const { data: ex } = await sb.from('messages').select(COLS).eq('id', it.id).maybeSingle()
            saved = (ex as Msg | null) ?? null
          } else if (isTransient(error)) {
            break // no connection yet: keep it queued and try again later
          } else {
            const failed: OutItem = { ...it, status: 'failed', error: nice(error.message) }
            await outboxPut(failed)
            setPending((p) => p.map((x) => (x.id === it.id ? failed : x)))
            continue
          }
        }
        await outboxDelete(it.id)
        setPending((p) => p.filter((x) => x.id !== it.id))
        if (saved) {
          const row: Msg = saved
          setMsgs((p) => (p.some((x) => x.id === row.id) ? p : [...p, row]))
        }
      }
    }
    try {
      const locks = (navigator as unknown as { locks?: { request: (n: string, f: () => Promise<void>) => Promise<void> } }).locks
      if (locks) await locks.request('songjog-outbox', sendAll)
      else await sendAll()
    } catch { /* try again later */ } finally { flushing.current = false }
  }

  async function retryMsg(id: string) {
    const it = pending.find((p) => p.id === id)
    if (!it) return
    const again: OutItem = { ...it, status: 'sending', error: undefined }
    setPending((p) => p.map((x) => (x.id === id ? again : x)))
    await outboxPut(again)
    flushOutbox()
  }

  async function dropMsg(id: string) {
    await outboxDelete(id)
    setPending((p) => p.filter((x) => x.id !== id))
  }

  // Upload a photo or voice note to private storage, then send it as a message
  async function upload(file: Blob, name: string, type: string) {
    const cid = activeRef.current, uid = meRef.current
    if (!supabase || !cid || !uid) return
    if (!navigator.onLine) { setErr(OFFLINE_MSG); return }
    setErr('')
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : 'bin'
    const path = `${cid}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: type })
    if (error) { setErr(nice(error.message)); return }
    await addMessage({ conversation_id: cid, sender_id: uid, attachment_path: path, attachment_name: name, attachment_type: type })
  }

  function onPick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!f.type.startsWith('image/')) { setErr('Only images can be sent for now.'); return }
    if (f.size > MAX_IMAGE) { setErr('Image must be 10 MB or smaller.'); return }
    upload(f, f.name || 'photo.jpg', f.type)
  }

  async function startRec() {
    setErr('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      recChunks.current = []
      recCancelled.current = false
      rec.ondataavailable = (e) => { if (e.data.size) recChunks.current.push(e.data) }
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        window.clearInterval(recTimer.current)
        setRecording(false); setRecSec(0)
        if (recCancelled.current) return
        const base = (rec.mimeType || 'audio/webm').split(';')[0]
        const blob = new Blob(recChunks.current, { type: base })
        upload(blob, base.includes('mp4') ? 'voice.m4a' : 'voice.webm', base)
      }
      recRef.current = rec
      rec.start()
      setRecording(true)
      let s = 0
      recTimer.current = window.setInterval(() => {
        s += 1
        setRecSec(s)
        if (s >= MAX_VOICE_SECONDS) rec.stop()
      }, 1000)
    } catch {
      setErr('Microphone not available. Please allow microphone access in your browser.')
    }
  }
  const stopRec = () => recRef.current?.stop()
  const cancelRec = () => { recCancelled.current = true; recRef.current?.stop() }

  async function deleteMsg(m: Msg) {
    if (!supabase) return
    if (!window.confirm('Delete this message for everyone?')) return
    setErr('')
    const when = new Date().toISOString()
    const { error } = await supabase.from('messages').update({ deleted_at: when, body: '' }).eq('id', m.id)
    if (error) { setErr(nice(error.message)); return }
    setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, deleted_at: when, body: '' } : x)))
    setSel(null)
    if (m.attachment_path) await supabase.storage.from('attachments').remove([m.attachment_path])
  }

  // Tap an emoji again to remove your reaction. Double-tap a message for a quick heart.
  async function react(m: Row, emoji: string) {
    if (!supabase || !me || m.deleted_at || m._pending) return
    const next = reactions[m.id]?.[me] === emoji ? '' : emoji
    setReactions((p) => ({ ...p, [m.id]: { ...(p[m.id] ?? {}), [me]: next } }))
    const { error } = await supabase.from('reactions')
      .upsert({ message_id: m.id, user_id: me, emoji: next }, { onConflict: 'message_id,user_id' })
    if (error) setErr(nice(error.message))
    setSel(null)
  }

  async function renamePeer(c: Conv) {
    setMenu(false)
    if (!supabase || !me || !c.peerId) return
    const cur = nicks[c.peerId] ?? ''
    const v = window.prompt(`Name for @${c.username}. Only you can see it. Leave empty to use the username.`, cur)
    if (v === null) return
    const name = v.trim().slice(0, 40)
    const pid = c.peerId
    if (!name) {
      await supabase.from('nicknames').delete().eq('owner_id', me).eq('target_id', pid)
      setNicks((p) => { const q2 = { ...p }; delete q2[pid]; return q2 })
      return
    }
    const { error } = await supabase.from('nicknames')
      .upsert({ owner_id: me, target_id: pid, nickname: name }, { onConflict: 'owner_id,target_id' })
    if (error) { setErr(nice(error.message)); return }
    setNicks((p) => ({ ...p, [pid]: name }))
  }

  async function toggleBlock(c: Conv) {
    setMenu(false)
    if (!supabase || !me || !c.peerId) return
    const pid = c.peerId
    if (blocked[pid]) {
      await supabase.from('blocks').delete().eq('blocker_id', me).eq('blocked_id', pid)
      setBlocked((p) => ({ ...p, [pid]: false }))
      return
    }
    if (!window.confirm(`Block @${c.username}? You will not be able to message each other.`)) return
    const { error } = await supabase.from('blocks').upsert({ blocker_id: me, blocked_id: pid })
    if (error) { setErr(nice(error.message)); return }
    setBlocked((p) => ({ ...p, [pid]: true }))
  }

  async function reportPeer(c: Conv) {
    setMenu(false)
    if (!supabase || !me || !c.peerId) return
    const why = window.prompt(`Why are you reporting @${c.username}? (3 to 1000 characters)`)
    if (why === null) return
    if (why.trim().length < 3) { setErr('Please write a short reason.'); return }
    const { error } = await supabase.from('reports')
      .insert({ reporter_id: me, reported_user_id: c.peerId, reason: why.trim().slice(0, 1000) })
    setErr(error ? nice(error.message) : '')
    if (!error) window.alert('Report sent. Thank you.')
  }

  // Delete a whole chat for everyone in it (files first, then the chat itself)
  async function deleteChat() {
    setMenu(false)
    const cid = activeRef.current
    if (!supabase || !cid) return
    if (!window.confirm('Delete this whole chat for both people? This cannot be undone. The person stays in your contacts.')) return
    setErr('')
    const { data: files } = await supabase.storage.from('attachments').list(cid, { limit: 1000 })
    if (files && files.length) {
      await supabase.storage.from('attachments').remove(files.map((f) => `${cid}/${f.name}`))
    }
    const { error } = await supabase.rpc('delete_conversation', { cid })
    if (error) { setErr(nice(error.message)); return }
    setActive(null)
    setConvs((cs) => cs.filter((c) => c.id !== cid))
    setMsgs((ms) => ms.filter((m) => m.conversation_id !== cid))
  }

  const unread = (c: Conv) =>
    msgs.filter((m) => m.conversation_id === c.id && m.sender_id !== me && new Date(m.created_at) > new Date(c.lastRead)).length
  const lastOf = (cid: string) => {
    const l = [...msgs].reverse().find((m) => m.conversation_id === cid)
    if (!l) return 'No messages yet'
    if (l.deleted_at) return 'Message deleted'
    if (l.attachment_type?.startsWith('audio/')) return 'Voice message'
    if (l.attachment_path) return 'Photo'
    return l.body ?? ''
  }
  const chat = convs.find((c) => c.id === active)
  const totalUnread = convs.reduce((n, c) => n + unread(c), 0)
  const onlineOf = (id: string) => pres.showOnline && !!pres.online[id]
  const presenceText = (id: string) => {
    if (onlineOf(id)) return 'Online'
    const t = pres.lastSeen[id]
    if (t && pres.showLast) return `Last seen ${fmtSeen(t)}`
    return pres.showOnline ? 'Offline' : ''
  }
  const chatPeers = new Set(convs.map((c) => c.peerId))
  const lastByConv: Record<string, number> = {}
  for (const m of msgs) {
    const t = new Date(m.created_at).getTime()
    if (t > (lastByConv[m.conversation_id] ?? 0)) lastByConv[m.conversation_id] = t
  }
  const entries: { kind: 'official' | 'chat' | 'gemini'; time: number; conv: Conv | null }[] = [
    ...(official.length
      ? [{ kind: 'official' as const, time: new Date(official[official.length - 1].created_at).getTime(), conv: null }]
      : []),
    { kind: 'gemini' as const, time: ai.msgs.length ? new Date(ai.msgs[ai.msgs.length - 1].at).getTime() : 0, conv: null },
    ...convs.map((c) => ({ kind: 'chat' as const, time: lastByConv[c.id] ?? 0, conv: c })),
  ].sort((x, y) => y.time - x.time)

  async function invite() {
    setTopMenu(false)
    const url = window.location.origin
    try {
      if (navigator.share) { await navigator.share({ title: brand.name, text: `Chat with me on ${brand.name}`, url }); return }
      await navigator.clipboard.writeText(url)
      window.alert('Link copied.')
    } catch { /* cancelled */ }
  }

  async function signOutNow() {
    setTopMenu(false)
    if (pending.length && !window.confirm('You have unsent messages. If you sign out, they will be deleted. Sign out anyway?')) return
    await supabase?.auth.signOut()
    clearCache()
    await outboxClear()
    window.location.replace('#/')
  }

  async function removeContact(id: string) {
    if (!supabase || !me) return
    if (!window.confirm('Remove this person from your contacts?')) return
    await supabase.from('contacts').delete().eq('owner_id', me).eq('contact_id', id)
    setContacts((p) => p.filter((c) => c.id !== id))
  }

  const notice = retention ? `Messages older than ${retention} days are deleted automatically.` : ''

  const renderNav = (current: 'chats' | 'contacts' | 'updates') => {
    const goTab = (t: 'chats' | 'contacts') => { setTab(t); if (activeRef.current) closePane() }
    return (
      <nav className="flex border-t border-navy-700 bg-navy-900 px-1 pb-1 pt-2">
        {[
          { key: 'chats', label: 'Chats', icon: <ChatIcon />, badge: totalUnread, active: current === 'chats', on: () => goTab('chats') },
          { key: 'contacts', label: 'Contacts', icon: <PeopleIcon />, badge: 0, active: current === 'contacts', on: () => goTab('contacts') },
          { key: 'updates', label: 'Updates', icon: <BellIcon />, badge: officialUnread, active: current === 'updates', on: () => { if (activeRef.current !== OFFICIAL) openPane(OFFICIAL) } },
          { key: 'me', label: 'Profile', icon: <UserIcon />, badge: 0, active: false, on: () => { window.location.hash = '/profile' } },
        ].map((t) => (
          <button key={t.key} onClick={t.on} className="flex flex-1 flex-col items-center gap-1 text-xs">
            <span className={`relative grid h-8 w-14 place-items-center rounded-full ${t.active ? 'bg-navy-700 text-gold-200' : 'text-silver-300'}`}>
              {t.icon}
              {t.badge > 0 && (
                <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-emerald-500 px-1 text-center text-[10px] font-bold text-white">
                  {t.badge > 99 ? '99+' : t.badge}
                </span>
              )}
            </span>
            <span className={t.active ? 'font-semibold text-silver-100' : 'text-silver-300'}>{t.label}</span>
          </button>
        ))}
      </nav>
    )
  }

  if (!me) return <div className="grid h-full place-items-center text-silver-300">Loading...</div>

  return (
    <div className="flex h-full flex-col bg-navy-950">
      {err && (
        <p role="alert" onClick={() => setErr('')} className="bg-red-900/40 px-4 py-2 text-center text-sm text-red-200">
          {err} (tap to close)
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className={`${active ? 'hidden' : 'relative flex'} w-full flex-col border-r border-navy-700 bg-navy-900 md:flex md:w-80`}>
          <header className="relative flex items-center gap-3 border-b border-navy-700 p-3">
            <Logo size={40} />
            <h1 className="min-w-0 flex-1 truncate font-display text-lg text-gold-200">{brand.name}</h1>
            <button onClick={() => setTopMenu(!topMenu)} aria-label="More options"
              className="px-2 text-2xl leading-none text-silver-100">&#8942;</button>
            {topMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setTopMenu(false)} />
                <div className="absolute right-3 top-14 z-20 w-52 rounded-xl border border-navy-700 bg-navy-800 p-1 text-sm shadow-lg">
                  <a href="#/profile" className="block rounded-lg px-3 py-2 active:bg-navy-700">Profile</a>
                  <button onClick={invite} className="block w-full rounded-lg px-3 py-2 text-left active:bg-navy-700">Invite friends</button>
                  <a href="#/privacy" className="block rounded-lg px-3 py-2 active:bg-navy-700">Privacy policy</a>
                  <a href="#/terms" className="block rounded-lg px-3 py-2 active:bg-navy-700">Terms of service</a>
                  {isAdmin && <a href="#/admin" className="block rounded-lg px-3 py-2 active:bg-navy-700">Admin panel</a>}
                  <button onClick={signOutNow} className="block w-full rounded-lg px-3 py-2 text-left text-red-300 active:bg-navy-700">Sign out</button>
                </div>
              </>
            )}
          </header>
          {tab === 'chats' ? (
            <div className="border-b border-navy-700 p-3">
              <input ref={searchRef} className="field" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder="Find a username" autoCapitalize="none" autoCorrect="off" />
            </div>
          ) : (
            <p className="border-b border-navy-700 px-4 py-3 text-lg text-gold-200">Contacts</p>
          )}
          <ul className="flex-1 overflow-y-auto">
            {tab === 'chats' && q.trim().length >= 2 && found.length === 0 && (
              <li className="p-4 text-sm text-silver-500">No users found.</li>
            )}
            {tab === 'chats' && found.map((u) => (
              <li key={u.id}>
                <button onClick={() => startChat(u.id)}
                  className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                  <Avatar path={u.avatar_path} name={u.username} />
                  <span className="flex-1">@{u.username}<span className="block text-xs text-silver-500">Start chat</span></span>
                </button>
              </li>
            ))}
            {tab === 'chats' && !q && convs.length === 0 && (
              <li className="p-4 text-sm text-silver-300">No chats yet. Search for a username above to start one.</li>
            )}
            {tab === 'chats' && !q && entries.map((e) => {
              if (e.kind === 'gemini') {
                const last = ai.msgs[ai.msgs.length - 1]
                return (
                  <li key="gemini">
                    <button onClick={() => openPane(GEMINI)}
                      className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-navy-700"><SparkIcon /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">Gemini AI</span>
                        <span className="block truncate text-sm text-silver-300">{last ? last.text : 'Ask me anything'}</span>
                      </span>
                    </button>
                  </li>
                )
              }
              if (e.kind === 'official') {
                return (
                  <li key="official">
                    <button onClick={() => openPane(OFFICIAL)}
                      className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                      <Logo size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 font-medium">
                          <span className="truncate">{brand.name}</span>
                          <span className="text-gold-400" aria-label="Official account">{'\u2605'}</span>
                        </span>
                        <span className="block truncate text-sm text-silver-300">{official[official.length - 1].body}</span>
                      </span>
                      {officialUnread > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs">{officialUnread}</span>}
                    </button>
                  </li>
                )
              }
              const c = e.conv as Conv
              const n = unread(c)
              return (
                <li key={c.id}>
                  <button onClick={() => openPane(c.id)}
                    className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                    <Avatar path={c.avatar} name={nameOf(c)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 font-medium">
                        <span className="truncate">{nameOf(c)}</span>
                        {c.peerId && onlineOf(c.peerId) && <OnlineDot />}
                      </span>
                      <span className="block truncate text-sm text-silver-300">{lastOf(c.id)}</span>
                    </span>
                    {n > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs">{n}</span>}
                  </button>
                </li>
              )
            })}
            {tab === 'contacts' && contacts.length === 0 && (
              <li className="p-4 text-sm text-silver-300">
                No contacts yet. People you chat with are saved here, even if you delete the chat.
              </li>
            )}
            {tab === 'contacts' && contacts.map((c) => (
              <li key={c.id} className="flex items-center border-b border-navy-800">
                <button onClick={() => startChat(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left active:bg-navy-800">
                  <Avatar path={c.avatar} name={nicks[c.id] || c.username} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{nicks[c.id] || c.username}</span>
                      {onlineOf(c.id) && <OnlineDot />}
                    </span>
                    <span className="block text-xs text-silver-500">{chatPeers.has(c.id) ? 'Open chat' : 'Tap to chat'}</span>
                  </span>
                </button>
                <button onClick={() => removeContact(c.id)} className="px-3 text-xs text-silver-500 underline">Remove</button>
              </li>
            ))}
          </ul>
          {notice && <p className="border-t border-navy-700 p-3 text-center text-xs text-silver-500">{notice}</p>}

          <div className="pointer-events-none absolute bottom-28 right-4 z-10 flex flex-col items-end gap-3">
            <button onClick={() => openPane(GEMINI)} aria-label="Gemini AI chat" title="Gemini AI"
              className="pointer-events-auto grid h-12 w-12 place-items-center rounded-2xl bg-navy-800 shadow-lg ring-1 ring-navy-700 active:scale-95">
              <SparkIcon />
            </button>
            <button
              onClick={() => { setTab('chats'); setQ(''); window.setTimeout(() => searchRef.current?.focus(), 60) }}
              aria-label="New chat" title="New chat"
              className="pointer-events-auto grid h-14 w-14 place-items-center rounded-2xl bg-white text-navy-950 shadow-lg active:scale-95">
              <NewChatIcon />
            </button>
          </div>

          {renderNav(tab)}
        </aside>

        <section className={`${active ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
          {active === GEMINI ? (
            <GeminiPane ai={ai} onBack={closePane} />
          ) : active === OFFICIAL ? (
            <>
              <header className="flex items-center gap-3 border-b border-navy-700 bg-navy-900 p-3">
                <button onClick={closePane} aria-label="Back to chats" className="px-2 text-xl text-gold-200 md:hidden">&larr;</button>
                <Logo size={36} />
                <span className="flex min-w-0 flex-1 items-center gap-2 font-medium">
                  <span className="truncate">{brand.name}</span>
                  <span className="text-gold-400" aria-label="Official account">{'\u2605'}</span>
                </span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {official.map((i) => (
                  <div key={i.id} className="flex flex-col items-start">
                    <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-silver-100 px-4 py-2 text-navy-950">
                      <p className="whitespace-pre-wrap break-words">{i.body}</p>
                      <p className="mt-1 text-right text-[10px] opacity-70">{fmtDate(i.created_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="border-t border-navy-700 bg-navy-900 p-3 text-center text-xs text-silver-500">
                Updates from {brand.name}. You cannot reply here.
              </p>
              <div className="md:hidden">{renderNav('updates')}</div>
            </>
          ) : chat ? (
            <>
              <header className="relative flex items-center gap-3 border-b border-navy-700 bg-navy-900 p-3">
                <button onClick={closePane} aria-label="Back to chats" className="px-2 text-xl text-gold-200 md:hidden">&larr;</button>
                <Avatar path={chat.avatar} name={nameOf(chat)} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{nameOf(chat)}</span>
                  {chat.peerId && presenceText(chat.peerId) && (
                    <span className="flex items-center gap-1 text-xs text-silver-300">
                      {onlineOf(chat.peerId) && <OnlineDot />}
                      {presenceText(chat.peerId)}
                    </span>
                  )}
                </span>
                <button onClick={() => setMenu(!menu)} aria-label="Chat options" className="px-2 text-2xl leading-none text-silver-300">&#8942;</button>
                {menu && (
                  <div className="absolute right-3 top-14 z-10 w-52 rounded-xl border border-navy-700 bg-navy-800 p-1 text-sm shadow-lg">
                    {chat.peerId && <button onClick={() => renamePeer(chat)} className="block w-full rounded-lg px-3 py-2 text-left active:bg-navy-700">Rename this person</button>}
                    {chat.peerId && <button onClick={() => toggleBlock(chat)} className="block w-full rounded-lg px-3 py-2 text-left active:bg-navy-700">{blocked[chat.peerId] ? 'Unblock' : 'Block'}</button>}
                    {chat.peerId && <button onClick={() => reportPeer(chat)} className="block w-full rounded-lg px-3 py-2 text-left active:bg-navy-700">Report</button>}
                    <button onClick={deleteChat} className="block w-full rounded-lg px-3 py-2 text-left text-red-300 active:bg-navy-700">Delete chat</button>
                  </div>
                )}
              </header>
              {notice && <p className="bg-navy-900 px-3 py-1 text-center text-[11px] text-silver-500">{notice}</p>}
              <div className="flex-1 space-y-2 overflow-y-auto p-4" onClick={() => setMenu(false)}>
                {thread.map((m) => {
                  const mine = m.sender_id === me
                  const pr = peerRead[m.conversation_id]
                  const seen = Boolean(pr) && new Date(pr) >= new Date(m.created_at)
                  const counts: Record<string, number> = {}
                  Object.values(reactions[m.id] ?? {}).forEach((e) => { if (e) counts[e] = (counts[e] ?? 0) + 1 })
                  const myReact = me ? reactions[m.id]?.[me] : ''
                  return (
                    <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div onClick={() => !m.deleted_at && !m._pending && setSel(sel === m.id ? null : m.id)}
                        onDoubleClick={() => react(m, HEART)}
                        className={`max-w-[80%] touch-manipulation rounded-2xl px-4 py-2 ${mine ? 'rounded-br-sm bg-bubble text-white' : 'rounded-bl-sm bg-silver-100 text-navy-950'}`}>
                        {m.deleted_at ? (
                          <p className="italic opacity-70">Message deleted</p>
                        ) : (
                          <>
                            {m.attachment_path && <Attach path={m.attachment_path} type={m.attachment_type} />}
                            {m.body ? <Body text={m.body} /> : null}
                          </>
                        )}
                        <p className="mt-1 flex items-center justify-end gap-1 text-[10px] opacity-80">
                          {fmt(m.created_at)}
                          {mine && !m.deleted_at && (
                            <>
                              {m._pending === 'sending' && <span>Sending</span>}
                              {m._pending === 'failed' && <span>Failed</span>}
                              <StatusDot kind={m._pending ? m._pending : seen ? 'seen' : 'sent'} />
                            </>
                          )}
                        </p>
                      </div>
                      {m._pending === 'failed' && (
                        <div className="mt-1 flex gap-3 text-xs">
                          <button onClick={() => retryMsg(m.id)} className="text-gold-200 underline">Retry</button>
                          <button onClick={() => dropMsg(m.id)} className="text-red-300 underline">Delete</button>
                        </div>
                      )}
                      {!m.deleted_at && Object.keys(counts).length > 0 && (
                        <div className="-mt-1 flex gap-1">
                          {Object.entries(counts).map(([e, n]) => (
                            <span key={e} className={`rounded-full px-2 text-xs ${myReact === e ? 'bg-gold-400/30' : 'bg-navy-800'}`}>{e} {n > 1 ? n : ''}</span>
                          ))}
                        </div>
                      )}
                      {sel === m.id && !m.deleted_at && (
                        <div className="mt-1 flex flex-wrap items-center gap-3 rounded-full bg-navy-800 px-3 py-1">
                          {EMOJIS.map((e) => (
                            <button key={e} onClick={() => react(m, e)} className="text-xl">{e}</button>
                          ))}
                          {mine && (
                            <button onClick={() => deleteMsg(m)} className="text-xs text-red-300 underline">Delete for everyone</button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
                <div ref={bottom} />
              </div>

              {recording ? (
                <div className="flex items-center gap-3 border-t border-navy-700 bg-navy-900 p-3">
                  <span className="flex-1 text-sm text-gold-200">Recording {recSec}s / {MAX_VOICE_SECONDS}s</span>
                  <button onClick={cancelRec} className="text-sm text-silver-300 underline">Cancel</button>
                  <button onClick={stopRec} aria-label="Send voice message"
                    className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-400 text-navy-950 active:scale-95">
                    <PlaneIcon />
                  </button>
                </div>
              ) : (
                <form onSubmit={send} className="flex items-center gap-2 border-t border-navy-700 bg-navy-900 p-3">
                  <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
                  <button type="button" aria-label="Send a photo" onClick={() => fileRef.current?.click()}
                    className="grid h-12 w-12 place-items-center rounded-full bg-navy-800 text-xl">&#128247;</button>
                  <input className="field min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message" enterKeyHint="send" maxLength={4000} />
                  {text.trim() ? (
                    <button aria-label="Send" className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-400 text-navy-950 active:scale-95">
                      <PlaneIcon />
                    </button>
                  ) : (
                    <button type="button" aria-label="Record a voice message" onClick={startRec}
                      className="grid h-12 w-12 place-items-center rounded-full bg-navy-800 text-xl">&#127908;</button>
                  )}
                </form>
              )}
            </>
          ) : (
            <div className="m-auto hidden text-center text-silver-300 md:block">
              <Logo size={120} />
              <p className="mt-4">Select a chat or search for a username.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
