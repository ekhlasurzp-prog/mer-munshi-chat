import { FormEvent, useEffect, useRef, useState } from 'react'
import type { useAiChat } from '../lib/ai'

type Ai = ReturnType<typeof useAiChat>

const Spark = ({ size = 26 }: { size?: number }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden>
    <defs><linearGradient id="gemg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFE08A" /><stop offset="1" stopColor="#1E90FF" /></linearGradient></defs>
    <path fill="url(#gemg)" d="M12 2l2.2 6.3L21 10.5l-6.8 2.2L12 20l-2.2-7.3L3 10.5l6.8-2.2z" />
    <path fill="url(#gemg)" d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
  </svg>
)

const Plane = () => (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden>
    <path d="M2.5 11.2 20.8 3.6c.8-.3 1.5.4 1.2 1.2L14.4 21c-.4.8-1.5.8-1.8 0l-2.2-5.6-5.6-2.2c-.8-.3-.8-1.4-.3-2Z" />
  </svg>
)

// Gemini sometimes sends markdown; show it as plain, tidy text
const tidy = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[*-]\s+/gm, '\u2022 ').replace(/^#+\s*/gm, '')

export default function GeminiPane({ ai, onBack }: { ai: Ai; onBack: () => void }) {
  const [text, setText] = useState('')
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [ai.msgs.length, ai.busy, ai.error])

  function submit(e: FormEvent) {
    e.preventDefault()
    const t = text.trim()
    if (!t) return
    if (ai.send(t)) setText('')
  }

  function clearAll() {
    if (window.confirm('Clear this AI chat from your phone?')) ai.clear()
  }

  return (
    <>
      <header className="flex items-center gap-3 border-b border-navy-700 bg-navy-900 p-3">
        <button onClick={onBack} aria-label="Back to chats" className="px-2 text-xl text-gold-200 md:hidden">&larr;</button>
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-navy-700"><Spark size={22} /></span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">Gemini AI</span>
          <span className="block text-xs text-silver-300">Powered by Google Gemini</span>
        </span>
        {ai.msgs.length > 0 && <button onClick={clearAll} className="text-xs text-silver-300 underline">Clear</button>}
      </header>

      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        <p className="rounded-xl bg-navy-900 p-3 text-center text-xs text-silver-500">
          Your messages here are sent to Google Gemini to get an answer. Answers can be wrong. Do not share passwords or private details.
        </p>
        {ai.msgs.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2 ${m.role === 'user' ? 'rounded-br-sm bg-bubble text-white' : 'rounded-bl-sm bg-silver-100 text-navy-950'}`}>
              <p className="whitespace-pre-wrap break-words">{m.role === 'user' ? m.text : tidy(m.text)}</p>
            </div>
          </div>
        ))}
        {ai.busy && (
          <div className="flex justify-start">
            <div className="animate-pulse rounded-2xl rounded-bl-sm bg-silver-100 px-4 py-2 text-navy-950">Gemini is thinking...</div>
          </div>
        )}
        {ai.error && (
          <p role="alert" className="text-center text-sm text-red-300">
            {ai.error}{' '}
            {ai.msgs.length > 0 && ai.msgs[ai.msgs.length - 1].role === 'user' && (
              <button onClick={ai.retry} className="underline">Try again</button>
            )}
          </p>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={submit} className="flex items-center gap-2 border-t border-navy-700 bg-navy-900 p-3">
        <input className="field min-w-0 flex-1" value={text} onChange={(e) => setText(e.target.value)}
          placeholder="Ask Gemini" enterKeyHint="send" maxLength={2000} />
        <button aria-label="Send" disabled={ai.busy}
          className="grid h-12 w-12 place-items-center rounded-full bg-gradient-to-b from-gold-200 to-gold-400 text-navy-950 active:scale-95 disabled:opacity-50">
          <Plane />
        </button>
      </form>
    </>
  )
}
