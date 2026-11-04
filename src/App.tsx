import { useEffect, useState } from 'react'
import Landing from './pages/Landing'
import Auth from './pages/Auth'
import Onboarding from './pages/Onboarding'
import ChatShell from './pages/ChatShell'

// Simple hash routing keeps the project dependency-free for now.
const route = () => window.location.hash.replace(/^#/, '') || '/'

export default function App() {
  const [path, setPath] = useState(route())
  useEffect(() => {
    const on = () => setPath(route())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  if (path === '/login') return <Auth mode="login" />
  if (path === '/signup') return <Auth mode="signup" />
  if (path === '/onboarding') return <Onboarding />
  if (path === '/chat') return <ChatShell />
  return <Landing />
}
