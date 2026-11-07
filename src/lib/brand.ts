import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// App name and logo set by the admin. Saved on the device so they also show offline.
export type Brand = { name: string; logo: string }
const KEY = 'mmc-brand'
const DEFAULT: Brand = { name: 'MER Munshi Chat', logo: '' }

let current: Brand = (() => {
  try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') } } catch { return DEFAULT }
})()
const listeners = new Set<(b: Brand) => void>()
let started = false

function apply(b: Brand) {
  document.title = b.name
  if (b.logo) {
    document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((l) => { l.href = b.logo })
  }
}
apply(current)

export async function refreshBrand() {
  if (!supabase) return
  try {
    const { data } = await supabase.rpc('get_branding')
    if (!data) return
    const d = data as { name?: string; logo_path?: string }
    const logo = d.logo_path ? supabase.storage.from('branding').getPublicUrl(d.logo_path).data.publicUrl : ''
    current = { name: d.name || DEFAULT.name, logo }
    try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* ignore */ }
    apply(current)
    listeners.forEach((l) => l(current))
  } catch { /* offline: keep the saved name and logo */ }
}

export function useBrand(): Brand {
  const [b, setB] = useState(current)
  useEffect(() => {
    listeners.add(setB)
    if (!started) {
      started = true
      refreshBrand()
      // Pick up a new name or logo whenever the app comes back to the screen
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshBrand() })
    }
    return () => { listeners.delete(setB) }
  }, [])
  return b
}
