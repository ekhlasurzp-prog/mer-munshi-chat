import { FormEvent, useState } from 'react'
import Logo from '../components/Logo'
import StatusBanner from '../components/StatusBanner'
import { backendConfigured, supabase } from '../lib/supabase'

export default function Auth({ mode }: { mode: 'login' | 'signup' }) {
  const signup = mode === 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setMsg('')
    if (!backendConfigured || !supabase) {
      setMsg('Backend not connected yet. Account creation and sign-in will work after Phase 3.')
      return
    }
    if (signup && password.length < 10) { setMsg('Use a password of at least 10 characters.'); return }
    setBusy(true)
    // Calls real Supabase Auth, but this path is UNTESTED until Phase 3 sets up the project.
    const { error } = signup
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) setMsg(error.message)
    else window.location.hash = signup ? '/onboarding' : '/chat'
  }

  return (
    <div className="min-h-full bg-[radial-gradient(ellipse_at_top,#142C63_0%,#050B1E_60%)]">
      <StatusBanner />
      <main className="mx-auto max-w-sm px-6 py-10">
        <a href="#/" className="flex flex-col items-center"><Logo size={110} glow /></a>
        <h1 className="mt-8 text-center font-display text-3xl text-gold-200">
          {signup ? 'Create your account' : 'Welcome back'}
        </h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <label className="block text-sm">Email
            <input className="field mt-1" type="email" autoComplete="email" required
              value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          </label>
          <label className="block text-sm">Password
            <input className="field mt-1" type="password" required
              autoComplete={signup ? 'new-password' : 'current-password'}
              value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          {signup && (
            <p className="text-xs text-silver-300">
              Your email is used only for sign-in and recovery. It is never shown to other users.
            </p>
          )}
          {msg && <p role="alert" className="text-sm text-gold-200">{msg}</p>}
          <button className="btn-gold w-full" disabled={busy}>{signup ? 'Create account' : 'Sign in'}</button>
        </form>
        <p className="mt-6 text-center text-sm text-silver-300">
          {signup ? 'Already have an account? ' : 'New here? '}
          <a className="text-gold-200 underline" href={signup ? '#/login' : '#/signup'}>
            {signup ? 'Sign in' : 'Create an account'}
          </a>
        </p>
      </main>
    </div>
  )
}
