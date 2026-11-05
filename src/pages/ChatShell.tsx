import { ChangeEvent, FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Logo from '../components/Logo'
import { supabase } from '../lib/supabase'

type Msg = {
  id: string; conversation_id: string; sender_id: string; body: string | null
  created_at: string; deleted_at: string | null
  attachment_path: string | null; attachment_name: string | null; attachment_type: string | null
}
type Conv = { id: string; name: string; lastRead: string }
type Found = { id: string; username: string }

const COLS = 'id,conversation_id,sender_id,body,created_at,deleted_at,attachment_path,attachment_name,attachment_type'
const MAX_IMAGE = 10 * 1024 * 1024 // 10 MB
const MAX_VOICE_SECONDS = 30
const LONG_TEXT = 300
const fmt = (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

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
  useEffect(() => {
    let ok = true
    supabase?.storage.from('attachments').createSignedUrl(path, 3600).then(({ data }) => {
      if (ok && data) setUrl(data.signedUrl)
    })
    return () => { ok = false }
  }, [path])
  if (!url) return <p className="text-xs opacity-70">Loading...</p>
  if (type?.startsWith('audio/')) return <audio controls src={url} className="max-w-full" />
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="Photo" className="max-h-64 rounded-lg" /></a>
}

export default function ChatShell() {
  const [me, setMe] = useState<string | null>(null)
  const [myName, setMyName] = useState('')
  const [convs, setConvs] = useState<Conv[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [peerRead, setPeerRead] = useState<Record<string, string>>({})
  const [active, setActive] = useState<string | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [err, setErr] = useState('')
  const [recording, setRecording] = useState(false)
  const [recSec, setRecSec] = useState(0)
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
    if (!supabase) return
    const { data: mem } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at, conversations(id,type,title)')
      .eq('user_id', uid)
    const rows = (mem ?? []) as any[]
    const ids = rows.map((r) => r.conversation_id)
    const types: Record<string, string> = {}
    rows.forEach((r) => { types[r.conversation_id] = r.conversations?.type })
    const names: Record<string, string> = {}
    const pr: Record<string, string> = {}
    if (ids.length) {
      const { data: others } = await supabase
        .from('conversation_members')
        .select('conversation_id, last_read_at, profiles(username)')
        .in('conversation_id', ids)
        .neq('user_id', uid)
      for (const o of (others ?? []) as any[]) {
        if (!names[o.conversation_id]) {
          names[o.conversation_id] = o.profiles?.username ?? 'user'
          if (types[o.conversation_id] === 'direct') pr[o.conversation_id] = o.last_read_at
        }
      }
    }
    setPeerRead(pr)
    setConvs(rows.map((r) => {
      const c = r.conversations
      const name = c?.type === 'group' ? (c.title ?? 'Group') : (names[r.conversation_id] ?? 'user')
      return { id: r.conversation_id, name, lastRead: r.last_read_at }
    }))
    const { data: m } = await supabase.from('messages').select(COLS)
      .order('created_at', { ascending: false }).limit(500)
    setMsgs(((m ?? []) as Msg[]).reverse())
  }, [])

  // Start-up: check sign-in, load data, listen for changes in real time
  useEffect(() => {
    if (!supabase) { window.location.hash = '/login'; return }
    const sb = supabase
    let cancelled = false
    let channel: ReturnType<typeof sb.channel> | null = null
    ;(async () => {
      const { data } = await sb.auth.getUser()
      if (!data.user) { window.location.hash = '/login'; return }
      const uid = data.user.id
      const { data: p } = await sb.from('profiles').select('username').eq('id', uid).maybeSingle()
      if (!p) { window.location.hash = '/onboarding'; return }
      if (cancelled) return
      setMe(uid); setMyName(p.username)
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
      const { data } = await supabase!.from('profiles').select('id,username')
        .ilike('username', `%${clean}%`).neq('id', me).limit(10)
      setFound((data ?? []) as Found[])
    }, 300)
    return () => clearTimeout(t)
  }, [q, me])
const thread = msgs.filter((m) => m.conversation_id === active)

  // Mark the open chat as read (using the newest message's server time) and scroll down
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

  async function startChat(userId: string) {
    if (!supabase || !me) return
    setErr('')
    const { data, error } = await supabase.rpc('start_direct_chat', { other: userId })
    if (error) { setErr(error.message); return }
    await loadAll(me)
    setQ(''); setFound([])
    setActive(data as string)
  }

  async function addMessage(row: Record<string, unknown>) {
    if (!supabase) return false
    const { data, error } = await supabase.from('messages').insert(row).select(COLS).single()
    if (error) { setErr(error.message); return false }
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
    setErr('')
    const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) : 'bin'
    const path = `${cid}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabase.storage.from('attachments').upload(path, file, { contentType: type })
    if (error) { setErr(error.message); return }
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
    if (error) { setErr(error.message); return }
    setMsgs((p) => p.map((x) => (x.id === m.id ? { ...x, deleted_at: when, body: '' } : x)))
    setSel(null)
  }

  async function signOut() {
    await supabase?.auth.signOut()
    window.location.hash = '/'
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

  if (!me) return <div className="grid h-full place-items-center text-silver-300">Loading...</div>
return (
    <div className="flex h-full flex-col bg-navy-950">
      {err && (
        <p role="alert" onClick={() => setErr('')} className="bg-red-900/40 px-4 py-2 text-center text-sm text-red-200">
          {err} (tap to close)
        </p>
      )}
      <div className="flex min-h-0 flex-1">
        <aside className={`${active ? 'hidden' : 'flex'} w-full flex-col border-r border-navy-700 bg-navy-900 md:flex md:w-80`}>
          <header className="flex items-center gap-3 border-b border-navy-700 p-3">
            <Logo size={40} />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-lg leading-tight text-gold-200">Munshi Chat</h1>
              <p className="truncate text-xs text-silver-300">@{myName}</p>
            </div>
            <button onClick={signOut} className="text-sm text-silver-300 underline">Sign out</button>
          </header>
          <div className="border-b border-navy-700 p-3">
            <input className="field" value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Find a username" autoCapitalize="none" autoCorrect="off" />
          </div>
          <ul className="flex-1 overflow-y-auto">
            {q.trim().length >= 2 && found.length === 0 && (
              <li className="p-4 text-sm text-silver-500">No users found.</li>
            )}
            {found.map((u) => (
              <li key={u.id}>
                <button onClick={() => startChat(u.id)}
                  className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-navy-700 text-gold-200">{u.username[0].toUpperCase()}</span>
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
                  <button onClick={() => setActive(c.id)}
                    className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                    <span className="grid h-11 w-11 place-items-center rounded-full bg-navy-700 text-gold-200">{c.name[0].toUpperCase()}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{c.name}</span>
                      <span className="block truncate text-sm text-silver-300">{lastOf(c.id)}</span>
                    </span>
                    {n > 0 && <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs">{n}</span>}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <section className={`${active ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
          {chat ? (
            <>
              <header className="flex items-center gap-3 border-b border-navy-700 bg-navy-900 p-3">
                <button onClick={() => setActive(null)} aria-label="Back to chats" className="px-2 text-xl text-gold-200 md:hidden">&larr;</button>
                <span className="font-medium">{chat.name}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {thread.map((m) => {
                  const mine = m.sender_id === me
                  const pr = peerRead[m.conversation_id]
                  const seen = Boolean(pr) && new Date(pr) >= new Date(m.created_at)
                  return (
                    <div key={m.id} className={`flex flex-col ${mine ? 'items-end' : 'items-start'}`}>
                      <div onClick={() => mine && !m.deleted_at && setSel(sel === m.id ? null : m.id)}
                        className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? 'rounded-br-sm bg-bubble text-white' : 'rounded-bl-sm bg-silver-100 text-navy-950'}`}>
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
                      {sel === m.id && mine && !m.deleted_at && (
                        <button onClick={() => deleteMsg(m)} className="mt-1 text-xs text-red-300 underline">
                          Delete for everyone
                        </button>
                      )}
                    </div>
                  )
                })}
                <div ref={bottom} />
              </div>

              {recording ? (
                <div className="flex items-center gap-3 border-t border-navy-700 bg-navy-900 p-3">
                  <span className="flex-1 text-sm text-gold-200">
                    Recording {recSec}s / {MAX_VOICE_SECONDS}s
                  </span>
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
