import { useState } from 'react'
import Logo from '../components/Logo'
import StatusBanner from '../components/StatusBanner'
import { backendConfigured, supabase } from '../lib/supabase'

const VALID = /^[a-z0-9_]{3,20}$/

export default function Onboarding() {
  const [name, setName] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const ok = VALID.test(name)

  async function save() {
    setMsg('')
    if (!backendConfigured || !supabase) { setMsg('Backend not connected yet.'); return }
    setBusy(true)
    const { data } = await supabase.auth.getUser()
    if (!data.user) {
      setBusy(false)
      setMsg('You are not signed in. Please sign in first.')
      return
    }
    const { error } = await supabase.from('profiles').insert({ id: data.user.id, username: name })
    setBusy(false)
    if (error) {
      setMsg(error.code === '23505' ? 'That username is already taken. Try another.' : error.message)
      return
    }
    window.location.hash = '/chat'
  }

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,#142C63_0%,#050B1E_60%)]">
      <StatusBanner />
      <main className="mx-auto max-w-sm px-6 py-10">
        <div className="flex justify-center"><Logo size={90} glow /></div>
        <h1 className="mt-6 text-center font-display text-3xl text-gold-200">Choose your username</h1>
        <p className="mt-2 text-center text-sm text-silver-300">
          This is the only name other people see. Your email stays private.
        </p>
        <input className="field mt-6" value={name} autoCapitalize="none" autoCorrect="off"
          onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="e.g. night_owl_42" />
        <p className="mt-2 text-xs text-silver-500">3 to 20 characters: lowercase letters, numbers, underscore.</p>
        {name && !ok && <p className="mt-2 text-sm text-gold-200">That username format is not allowed.</p>}
        {msg && <p role="alert" className="mt-2 text-sm text-gold-200">{msg}</p>}
        <button onClick={save} disabled={!ok || busy} className="btn-gold mt-6 w-full disabled:opacity-40">
          Save username
        </button>
      </main>
    </div>
  )
}
