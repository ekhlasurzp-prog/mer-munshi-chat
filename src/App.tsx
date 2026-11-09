import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import ChatShell from './pages/ChatShell'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Legal from './pages/Legal'
import NotifyBar from './components/NotifyBar'
import Splash from './components/Splash'
import { supabase } from './lib/supabase'
import { startPresence, stopPresence } from './lib/presence'

// Simple hash routing keeps the project dependency-free for now.
const route = () => window.location.hash.replace(/^#/, '') || '/'
let splashShown = false // the intro plays once each time the app is opened

export default function App() {
  const [path, setPath] = useState(route())
  const [splash, setSplash] = useState(!splashShown)
  useEffect(() => {
    const on = () => setPath(route())
    window.addEventListener('hashchange', on)
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    // Already signed in? Skip the landing and login pages and open the chat.
    if (supabase && ['/', '/login'].includes(route())) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) window.location.replace('#/chat')
      })
    }
    return () => window.removeEventListener('hashchange', on)
  }, [])

  // Online status runs on every page while someone is signed in
  useEffect(() => {
    const sb = supabase
    if (!sb) return
    sb.auth.getSession().then(({ data }) => { if (data.session) startPresence(data.session.user.id) })
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      window.setTimeout(() => { if (session) startPresence(session.user.id); else stopPresence() }, 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  let view
  if (path === '/login') view = <Auth mode="login" />
  else if (path === '/signup') view = <Auth mode="signup" />
  else if (path === '/onboarding') view = <Onboarding />
  else if (path === '/profile') view = <Profile />
  else if (path === '/admin') view = <Admin />
  else if (path === '/privacy') view = <Legal kind="privacy" />
  else if (path === '/terms') view = <Legal kind="terms" />
  else if (path === '/chat') {
    view = (
      <div className="flex h-full flex-col">
        <NotifyBar />
        <div className="min-h-0 flex-1"><ChatShell /></div>
      </div>
    )
  } else view = <Landing />

  return (
    <>
      {view}
      {splash && <Splash onDone={() => { splashShown = true; setSplash(false) }} />}
    </>
  )
}
