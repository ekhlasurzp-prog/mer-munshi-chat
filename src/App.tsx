import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import ChatShell from './pages/ChatShell'
import Profile from './pages/Profile'
import Admin from './pages/Admin'
import Legal from './pages/Legal'
import NotifyBar from './components/NotifyBar'
import { supabase } from './lib/supabase'

// Simple hash routing keeps the project dependency-free for now.
const route = () => window.location.hash.replace(/^#/, '') || '/'

export default function App() {
  const [path, setPath] = useState(route())
  useEffect(() => {
    const on = () => setPath(route())
    window.addEventListener('hashchange', on)
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {})
    // Already signed in? Skip the landing and login pages and open the chat.
    if (supabase && ['/', '/login'].includes(route())) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) window.location.hash = '/chat'
      })
    }
    return () => window.removeEventListener('hashchange', on)
  }, [])

  if (path === '/login') return <Auth mode="login" />
  if (path === '/signup') return <Auth mode="signup" />
  if (path === '/onboarding') return <Onboarding />
  if (path === '/profile') return <Profile />
  if (path === '/admin') return <Admin />
  if (path === '/privacy') return <Legal kind="privacy" />
  if (path === '/terms') return <Legal kind="terms" />
  if (path === '/chat') {
    return (
      <div className="flex h-full flex-col">
        <NotifyBar />
        <div className="min-h-0 flex-1"><ChatShell /></div>
      </div>
    )
  }
  return <Landing />
}
