import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import Logo from '../components/Logo'
import { supabase } from '../lib/supabase'

type Msg = { id: string; conversation_id: string; sender_id: string; body: string | null; created_at: string; deleted_at: string | null }
type Conv = { id: string; name: string; lastRead: string }
type Found = { id: string; username: string }

const COLS = 'id,conversation_id,sender_id,body,created_at,deleted_at'
const fmt = (s: string) => new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const PlaneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M2.5 11.2 20.8 3.6c.8-.3 1.5.4 1.2 1.2L14.4 21c-.4.8-1.5.8-1.8 0l-2.2-5.6-5.6-2.2c-.8-.3-.8-1.4-.3-2Z" />
  </svg>
)

export default function ChatShell() {
  const [me, setMe] = useState<string | null>(null)
  const [myName, setMyName] = useState('')
  const [convs, setConvs] = useState<Conv[]>([])
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [found, setFound] = useState<Found[]>([])
  const [err, setErr] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  const convsRef = useRef<Conv[]>([])
  convsRef.current = convs

  const loadAll = useCallback(async (uid: string) => {
    if (!supabase) return
    const { data: mem } = await supabase
      .from('conversation_members')
      .select('conversation_id, last_read_at, conversations(id,type,title)')
      .eq('user_id', uid)
    const rows = (mem ?? []) as any[]
    const ids = rows.map((r) => r.conversation_id)
    const names: Record<string, string> = {}
    if (ids.length) {
      const { data: others } = await supabase
        .from('conversation_members')
        .select('conversation_id, profiles(username)')
        .in('conversation_id', ids)
        .neq('user_id', uid)
      for (const o of (others ?? []) as any[]) {
        if (!names[o.conversation_id]) names[o.conversation_id] = o.profiles?.username ?? 'user'
      }
    }
    setConvs(rows.map((r) => {
      const c = r.conversations
      const name = c?.type === 'group' ? (c.title ?? 'Group') : (names[r.conversation_id] ?? 'user')
      return { id: r.conversation_id, name, lastRead: r.last_read_at }
    }))
    const { data: m } = await supabase.from('messages').select(COLS)
      .order('created_at', { ascending: false }).limit(500)
    setMsgs(((m ?? []) as Msg[]).reverse())
  }, [])

  // Start-up: check sign-in, load data, listen for new messages in real time
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
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${uid}` },
          () => loadAll(uid))
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

  // Mark the open chat as read, keep the view at the newest message
  useEffect(() => {
    if (!active || !me || !supabase) return
    const now = new Date().toISOString()
    setConvs((cs) => cs.map((c) => (c.id === active ? { ...c, lastRead: now } : c)))
    supabase.from('conversation_members').update({ last_read_at: now })
      .eq('conversation_id', active).eq('user_id', me).then(() => {})
    bottom.current?.scrollIntoView({ block: 'end' })
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

  async function send(e: FormEvent) {
    e.preventDefault()
    const body = text.trim()
    if (!body || !active || !me || !supabase) return
    setErr(''); setText('')
    const { data, error } = await supabase.from('messages')
      .insert({ conversation_id: active, sender_id: me, body }).select(COLS).single()
    if (error) { setErr(error.message); setText(body); return }
    const m = data as Msg
    setMsgs((p) => (p.some((x) => x.id === m.id) ? p : [...p, m]))
  }

  async function signOut() {
    await supabase?.auth.signOut()
    window.location.hash = '/'
  }

  const unread = (c: Conv) =>
    msgs.filter((m) => m.conversation_id === c.id && m.sender_id !== me && new Date(m.created_at) > new Date(c.lastRead)).length
  const lastOf = (cid: string) => {
    const l = [...msgs].reverse().find((m) => m.conversation_id === cid)
    return l ? (l.deleted_at ? 'Message deleted' : l.body ?? 'Attachment') : 'No messages yet'
  }
  const chat = convs.find((c) => c.id === active)

  if (!me) return <div className="grid h-full place-items-center text-silver-300">Loading...</div>

  return (
    <div className="flex h-full flex-col bg-navy-950">
      {err && <p role="alert" className="bg-red-900/40 px-4 py-2 text-center text-sm text-red-200">{err}</p>}
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
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${mine ? 'rounded-br-sm bg-bubble text-white' : 'rounded-bl-sm bg-silver-100 text-navy-950'}`}>
                        <p className="whitespace-pre-wrap break-words">{m.deleted_at ? 'Message deleted' : m.body}</p>
                        <p className="mt-1 text-right text-[10px] opacity-70">{fmt(m.created_at)}</p>
                      </div>
                    </div>
                  )
                })}
                <div ref={bottom} />
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-navy-700 bg-navy-900 p-3">
                <input className="field flex-1" value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Type a message" enterKeyHint="send" maxLength={4000} />
                <button aria-label="Send" className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-400 text-navy-950 active:scale-95">
                  <PlaneIcon />
                </button>
              </form>
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
