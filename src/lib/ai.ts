import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Chat with Gemini inside the app. The conversation is kept only on this phone.
// Each question goes through our own server function, so the Gemini key is never in the app.
export type AiMsg = { id: string; role: 'user' | 'model'; text: string; at: string }

const KEY = (uid: string) => `mmc-ai-${uid}`
const load = (uid: string): AiMsg[] => {
  try { return JSON.parse(localStorage.getItem(KEY(uid)) || '[]') as AiMsg[] } catch { return [] }
}
const save = (uid: string, m: AiMsg[]) => {
  try { localStorage.setItem(KEY(uid), JSON.stringify(m.slice(-60))) } catch { /* storage full: skip */ }
}

export function useAiChat(uid: string | null) {
  const [msgs, setMsgs] = useState<AiMsg[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { setMsgs(uid ? load(uid) : []); setError('') }, [uid])

  async function ask(uidNow: string, history: AiMsg[]) {
    const sb = supabase
    if (!sb) return
    setBusy(true); setError('')
    try {
      const payload = history.slice(-20).map((m) => ({ role: m.role, text: m.text }))
      const timeout = new Promise<never>((_, reject) => {
        window.setTimeout(() => reject(new Error('The AI took too long. Please try again.')), 45000)
      })
      const { data, error: err } = await Promise.race([
        sb.functions.invoke('gemini-chat', { body: { messages: payload } }),
        timeout,
      ])
      if (data?.error) throw new Error(String(data.error))
      if (err || !data?.reply) {
        let msg = 'The AI is not available right now. Please try again.'
        const ctx = (err as unknown as { context?: { json?: () => Promise<{ error?: string; message?: string }> } } | null)?.context
        if (ctx?.json) {
          try {
            const j = await ctx.json()
            if (j?.error) msg = j.error
            else if (j?.message) msg = 'AI error: ' + String(j.message).slice(0, 120)
          } catch { /* keep the default message */ }
        }
        const st = (err as unknown as { context?: { status?: number } } | null)?.context?.status
        if (st && msg.startsWith('The AI is not available')) msg = `The AI is not available right now (error ${st}). Please try again.`
        throw new Error(msg)
      }
      const reply: AiMsg = { id: crypto.randomUUID(), role: 'model', text: String(data.reply), at: new Date().toISOString() }
      setMsgs((p) => { const n = [...p, reply]; save(uidNow, n); return n })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    }
    setBusy(false)
  }

  // Returns false if the question was not accepted (offline or already waiting for an answer)
  const send = (text: string): boolean => {
    if (!supabase || !uid || busy) return false
    if (!navigator.onLine) { setError('The AI needs internet.'); return false }
    const m: AiMsg = { id: crypto.randomUUID(), role: 'user', text, at: new Date().toISOString() }
    const next = [...msgs, m]
    setMsgs(next)
    save(uid, next)
    void ask(uid, next)
    return true
  }

  const retry = () => {
    if (uid && !busy && msgs.length && msgs[msgs.length - 1].role === 'user') void ask(uid, msgs)
  }

  const clear = () => {
    if (uid) { try { localStorage.removeItem(KEY(uid)) } catch { /* ignore */ } }
    setMsgs([]); setError('')
  }

  return { msgs, busy, error, send, retry, clear }
}
