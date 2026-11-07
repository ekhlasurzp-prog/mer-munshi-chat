import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Logo from '../components/Logo'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { useBrand } from '../lib/brand'
import { clearCache, readCache, writeCache } from '../lib/offline'

type Msg = {
  id: string; conversation_id: string; sender_id: string; body: string | null
  created_at: string; deleted_at: string | null
  attachment_path: string | null; attachment_name: string | null; attachment_type: string | null
}
type Conv = { id: string; type: string; username: string; peerId: string | null; avatar: string | null; lastRead: string }
type Found = { id: string; username: string; avatar_path: string | null }
type Reacts = Record<string, Record<string, string>>
type Ann = { id: string; body: string; created_at: string }
type Contact = { id: string; username: string; avatar: string | null }
const OFFICIAL = 'official'
const readSeen = () => { try { return localStorage.getItem('mmc-official-seen') || '' } catch { return '' } }
const fmtDate = (s: string) => new Date(s).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
const OFFLINE_MSG = 'You are offline. You can read saved messages, but sending needs internet.'

const COLS = 'id,conversation_id,sender_id,body,created_at,deleted_at,attachment_path,attachment_name,attachment_type'
const EMOJIS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F64F}']
const HEART = EMOJIS[1]
const MAX_IMAGE = 10 * 1024 * 1024 // 10 MB
const MAX_VOICE_SECONDS = 30
const LONG_TEXT = 300
const fmt = (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const nice = (m: string) =>
  /row-level security/i.test(m) ? 'Could not send. The chat may have been deleted, or sending is blocked.' : m

const PlaneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M2.5 11.2 20.8 3.6c.8-.3 1.5.4 1.2 1.2L14.4 21c-.4.8-1.5.8-1.8 0l-2.2-5.6-5.6-2.2c-.8-.3-.8-1.4-.3-2Z" />
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
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine)
  const brand = useBrand()
  const bottom = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const convsRef = useRef<Conv[]>([])
  const activeRef = useRef<string | null>(null)
  const meRef = useRef<string | null>(null)
  const lastMarked = useRef<Record<string, string>>({})
  const recRef = useRef<MediaRecorder | null>(null)
  const recChunks = useRef<Blob[]>([])
  const recCancelled = useRef(false)
  const recTimer = useRef<number | undefined>(undefined)
  convsRef.current = convs
  activeRef.current = active
  meRef.current = me

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

      const [m, n, b, rx, ret, an, pf, wl, ct] = await Promise.all([
        sb.from('messages').select(COLS).order('created_at', { ascending: false }).limit(500),
        sb.from('nicknames').select('target_id, nickname').eq('owner_id', uid),
        sb.from('blocks').select('blocked_id').eq('blocker_id', uid),
        sb.from('reactions').select('message_id, user_id, emoji').limit(3000),
        sb.rpc('get_retention'),
        sb.from('announcements').select('id, body, created_at').order('created_at', { ascending: false }).limit(30),
        sb.from('profiles').select('created_at').eq('id', uid).maybeSingle(),
        sb.rpc('get_welcome'),
        sb.from('contacts').select('contact_id').eq('owner_id', uid),
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
    if (!supabase) { window.location.hash = '/login'; return }
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
          clearCache(); window.location.hash = '/login'; return
        }
      }
      if (cached && cached.uid !== uid) {
        clearCache(); setConvs([]); setMsgs([]); setNicks({}); setPeerRead({}); setAnns([])
        setContacts([]); setJoined(''); setWelcome('')
      }
      if (navigator.onLine) {
        const { data: p } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle()
        if (!p) { window.location.hash = '/onboarding'; return }
      }
      if (cancelled) return
      setMe(uid)
      await loadAll(uid)
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

  const thread = msgs.filter((m) => m.conversation_id === active)

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
    const on = () => { if (document.visibilityState === 'visible') loadAll(me) }
    const goOnline = () => { setOnline(true); loadAll(me) }
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

  // If the open chat no longer exists, go back to the list
  useEffect(() => {
    if (active && active !== OFFICIAL && !convs.some((c) => c.id === active)) setActive(null)
  }, [convs, active])

  // Mark the open chat as read (newest message's server time) and scroll down
  useEffect(() => {
    if (!active || !me || !supabase) return
    bottom.current?.scrollIntoView({ block: 'end' })
    const latest = thread[thread.length - 1]?.created_at
    if (!latest || lastMarked.current[active] === latest) return
    lastMarked.current[active] = latest
    setConvs((cs) => cs.map((c) => (c.id === active ? { ...c, lastRead: latest } : c)))
    supabase.from('conversation_members').update({ last_read_at: latest })
      .eq('conversation_id', active).eq('user_id', me).then(() => {})
  }, [active, me, thread.length])

  const nameOf = (c: Conv) => (c.peerId && nicks[c.peerId]) || c.username

  async function startChat(userId: string) {
    if (!supabase || !me) return
    setErr('')
    const { data, error } = await supabase.rpc('start_direct_chat', { other: userId })
    if (error) { setErr(nice(error.message)); return }
    await loadAll(me)
    setQ(''); setFound([])
    setActive(data as string)
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
    const ok = await addMessage({ conversation_id: active, sender_id: me, body })
    if (!ok) setText(body)
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
  async function react(m: Msg, emoji: string) {
    if (!supabase || !me || m.deleted_at) return
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
  const chatPeers = new Set(convs.map((c) => c.peerId))
  const contactsOnly = contacts.filter((c) => !chatPeers.has(c.id))

  async function removeContact(id: string) {
    if (!supabase || !me) return
    if (!window.confirm('Remove this person from your contacts?')) return
    await supabase.from('contacts').delete().eq('owner_id', me).eq('contact_id', id)
    setContacts((p) => p.filter((c) => c.id !== id))
  }

  const notice = retention ? `Messages older than ${retention} days are deleted automatically.` : ''

  if (!me) return <div className="grid h-full place-items-center text-silver-300">Loading...</div>

  return (
    <div className="flex h-full flex-col bg-navy-950">
      {err && (
        <p role="alert" onClick={() => setErr('')} className="bg-red-900/40 px-4 py-2 text-center text-sm text-red-200">
          {err} (tap to close)
        </p>
      )}
      {!online && (
        <p className="bg-gold-400/15 px-4 py-1 text-center text-xs text-gold-200">
          Offline: showing saved messages. Photos, voice notes and sending need internet.
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className={`${active ? 'hidden' : 'flex'} w-full flex-col border-r border-navy-700 bg-navy-900 md:flex md:w-80`}>
          <header className="flex items-center gap-3 border-b border-navy-700 p-3">
            <Logo size={40} />
            <h1 className="min-w-0 flex-1 truncate font-display text-lg text-gold-200">{brand.name}</h1>
            <a href="#/profile" className="rounded-full border border-gold-400/70 px-3 py-1 text-sm text-gold-200">Profile</a>
          </header>
          <div className="border-b border-navy-700 p-3">
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find a username" autoCapitalize="none" autoCorrect="off" />
          </div>
          <ul className="flex-1 overflow-y-auto">
            {!q && official.length > 0 && (
              <li>
                <button onClick={() => { setActive(OFFICIAL); setMenu(false) }}
                  className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                  <Logo size={44} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-medium">
                      <span className="truncate">{brand.name}</span>
                      <span className="rounded-full bg-gold-400/20 px-2 text-[10px] text-gold-200">Official</span>
                    </span>
                    <span className="block truncate text-sm text-silver-300">{official[official.length - 1].body}</span>
                  </span>
                  {officialUnread > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs">{officialUnread}</span>}
                </button>
              </li>
            )}
            {q.trim().length >= 2 && found.length === 0 && (
              <li className="p-4 text-sm text-silver-500">No users found.</li>
            )}
            {found.map((u) => (
              <li key={u.id}>
                <button onClick={() => startChat(u.id)}
                  className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                  <Avatar path={u.avatar_path} name={u.username} />
                  <span className="flex-1">@{u.username}<span className="block text-xs text-silver-500">Start chat</span></span>
                </button>
              </li>
            ))}
            {!q && convs.length === 0 && (
              <li className="p-4 text-sm text-silver-300">No chats yet. Search for a username above to start one.</li>
            )}
            {!q && convs.map((c) => {
              const n = unread(c)
              return (
                <li key={c.id}>
                  <button onClick={() => { setActive(c.id); setMenu(false); setSel(null) }}
                    className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                    <Avatar path={c.avatar} name={nameOf(c)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{nameOf(c)}</span>
                      <span className="block truncate text-sm text-silver-300">{lastOf(c.id)}</span>
                    </span>
                    {n > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs">{n}</span>}
                  </button>
                </li>
              )
            })}
            {!q && contactsOnly.length > 0 && (
              <>
                <li className="bg-navy-950 px-3 py-1 text-xs uppercase tracking-wide text-silver-500">Contacts</li>
                {contactsOnly.map((c) => (
                  <li key={c.id} className="flex items-center border-b border-navy-800">
                    <button onClick={() => startChat(c.id)}
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left active:bg-navy-800">
                      <Avatar path={c.avatar} name={nicks[c.id] || c.username} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{nicks[c.id] || c.username}</span>
                        <span className="block text-xs text-silver-500">Tap to chat</span>
                      </span>
                    </button>
                    <button onClick={() => removeContact(c.id)} className="px-3 text-xs text-silver-500 underline">Remove</button>
                  </li>
                ))}
              </>
            )}
          </ul>
          {notice && <p className="border-t border-navy-700 p-3 text-center text-xs text-silver-500">{notice}</p>}
        </aside>

        <section className={`${active ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
          {active === OFFICIAL ? (
            <>
              <header className="flex items-center gap-3 border-b border-navy-700 bg-navy-900 p-3">
                <button onClick={() => setActive(null)} aria-label="Back to chats" className="px-2 text-xl text-gold-200 md:hidden">&larr;</button>
                <Logo size={36} />
                <span className="flex-1 truncate font-medium">{brand.name}</span>
                <span className="rounded-full bg-gold-400/20 px-2 text-[11px] text-gold-200">Official</span>
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
                Official updates from {brand.name}. You cannot reply here.
              </p>
            </>
          ) : chat ? (
            <>
              <header className="relative flex items-center gap-3 border-b border-navy-700 bg-navy-900 p-3">
                <button onClick={() => setActive(null)} aria-label="Back to chats" className="px-2 text-xl text-gold-200 md:hidden">&larr;</button>
                <Avatar path={chat.avatar} name={nameOf(chat)} size={36} />
                <span className="flex-1 truncate font-medium">{nameOf(chat)}</span>
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
                      <div onClick={() => !m.deleted_at && setSel(sel === m.id ? null : m.id)}
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
                            <span className={seen ? 'font-bold text-gold-200' : ''} title={seen ? 'Seen' : 'Sent'}>
                              {seen ? '\u2713\u2713' : '\u2713'}
                            </span>
                          )}
                        </p>
                      </div>
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
