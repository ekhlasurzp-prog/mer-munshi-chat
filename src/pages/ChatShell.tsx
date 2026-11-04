import { FormEvent, useState } from 'react'
import Logo from '../components/Logo'

// SAMPLE DATA for layout preview only. Removed in Phase 4 when real messages load from Supabase.
type Msg = { id: number; mine: boolean; text: string; time: string }
const SAMPLE_CHATS = [
  { id: 1, name: 'sample_user_1', last: 'This is a sample conversation', unread: 2 },
  { id: 2, name: 'sample_group', last: 'Sample group preview', unread: 0 },
]
const SAMPLE_MSGS: Msg[] = [
  { id: 1, mine: false, text: 'Sample incoming message.', time: '10:00' },
  { id: 2, mine: true, text: 'Sample reply. Nothing here is real or saved.', time: '10:01' },
]

const PlaneIcon = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M2.5 11.2 20.8 3.6c.8-.3 1.5.4 1.2 1.2L14.4 21c-.4.8-1.5.8-1.8 0l-2.2-5.6-5.6-2.2c-.8-.3-.8-1.4-.3-2Z" />
  </svg>
)

export default function ChatShell() {
  const [active, setActive] = useState<number | null>(null)
  const [msgs, setMsgs] = useState<Msg[]>(SAMPLE_MSGS)
  const [text, setText] = useState('')
  const chat = SAMPLE_CHATS.find((c) => c.id === active)

  function send(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setMsgs([...msgs, { id: Date.now(), mine: true, text: text.trim(), time: 'now' }])
    setText('')
  }

  return (
    <div className="flex h-full flex-col bg-navy-950">
      <p className="bg-gold-400/15 px-4 py-1.5 text-center text-xs text-gold-200">
        Layout preview with sample data. Messages are not sent or stored.
      </p>
      <div className="flex min-h-0 flex-1">
        {/* Chat list: full screen on phones, sidebar on wider screens */}
        <aside className={`${active ? 'hidden' : 'flex'} w-full flex-col border-r border-navy-700 bg-navy-900 md:flex md:w-80`}>
          <header className="flex items-center gap-3 border-b border-navy-700 p-3">
            <Logo size={40} />
            <h1 className="flex-1 font-display text-lg text-gold-200">Munshi Chat</h1>
            <button className="text-silver-500" disabled title="Search: not built yet">Search</button>
          </header>
          <ul className="flex-1 overflow-y-auto">
            {SAMPLE_CHATS.map((c) => (
              <li key={c.id}>
                <button onClick={() => setActive(c.id)}
                  className="flex w-full items-center gap-3 border-b border-navy-800 p-3 text-left active:bg-navy-800">
                  <span className="grid h-11 w-11 place-items-center rounded-full bg-navy-700 text-gold-200">
                    {c.name[0].toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{c.name}</span>
                    <span className="block truncate text-sm text-silver-300">{c.last}</span>
                  </span>
                  {c.unread > 0 && (
                    <span className="rounded-full bg-emerald-600 px-2 py-0.5 text-xs">{c.unread}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
          <a href="#/" className="p-3 text-center text-xs text-silver-500">Back to home</a>
        </aside>

        {/* Conversation */}
        <section className={`${active ? 'flex' : 'hidden'} min-w-0 flex-1 flex-col md:flex`}>
          {chat ? (
            <>
              <header className="flex items-center gap-3 border-b border-navy-700 bg-navy-900 p-3">
                <button onClick={() => setActive(null)} aria-label="Back to chats"
                  className="px-2 text-xl text-gold-200 md:hidden">&larr;</button>
                <span className="font-medium">{chat.name}</span>
              </header>
              <div className="flex-1 space-y-2 overflow-y-auto p-4">
                {msgs.map((m) => (
                  <div key={m.id} className={`flex ${m.mine ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${m.mine ? 'rounded-br-sm bg-bubble text-white' : 'rounded-bl-sm bg-silver-100 text-navy-950'}`}>
                      <p className="break-words">{m.text}</p>
                      <p className="mt-1 text-right text-[10px] opacity-70">{m.time}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={send} className="flex items-center gap-2 border-t border-navy-700 bg-navy-900 p-3">
                <input className="field flex-1" value={text} onChange={(e) => setText(e.target.value)}
                  placeholder="Type a message" enterKeyHint="send" />
                <button aria-label="Send" className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-400 text-navy-950 active:scale-95">
                  <PlaneIcon />
                </button>
              </form>
            </>
          ) : (
            <div className="m-auto hidden text-center text-silver-300 md:block">
              <Logo size={120} />
              <p className="mt-4">Select a conversation to start.</p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
