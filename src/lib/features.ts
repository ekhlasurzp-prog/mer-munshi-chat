import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Switches the admin uses to show or hide parts of the app. A feature with no switch set is ON.
export const FEATURES = [
  { key: 'ai', label: 'GCM AI chat', desc: 'The AI chat and its logo button' },
  { key: 'photos', label: 'Sending photos', desc: 'The camera button in chats' },
  { key: 'voice', label: 'Voice messages', desc: 'The microphone button in chats' },
  { key: 'reactions', label: 'Reactions', desc: 'Emoji reactions and the double-tap heart' },
  { key: 'seen', label: 'Seen status', desc: 'The green dot when a message is read' },
  { key: 'online', label: 'Online and last seen', desc: 'Online dot, last seen and the privacy switches' },
  { key: 'contacts', label: 'Contacts tab', desc: 'Saved contacts in the bottom bar' },
  { key: 'updates', label: 'Updates tab and official chat', desc: 'Welcome message and announcements' },
  { key: 'profile_photo', label: 'Profile photo', desc: 'Adding or changing a profile photo' },
  { key: 'nicknames', label: 'Private names', desc: '"Rename this person" in the chat menu' },
  { key: 'block_report', label: 'Block and report', desc: 'Block and Report in the chat menu' },
  { key: 'delete_chat', label: 'Delete chat', desc: 'Deleting a whole chat for everyone' },
  { key: 'invite', label: 'Invite friends', desc: 'The invite link in the top menu' },
] as const

export type Features = Record<string, boolean>
const KEY = 'mmc-features'

let current: Features = (() => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}') as Features } catch { return {} }
})()
const listeners = new Set<(f: Features) => void>()
let started = false

export async function refreshFeatures() {
  if (!supabase) return
  try {
    const { data, error } = await supabase.rpc('get_features')
    if (error || !data) return
    current = data as Features
    try { localStorage.setItem(KEY, JSON.stringify(current)) } catch { /* ignore */ }
    listeners.forEach((l) => l(current))
  } catch { /* offline: keep the saved switches */ }
}

export function useFeatures(): Features {
  const [f, setF] = useState(current)
  useEffect(() => {
    listeners.add(setF)
    setF(current)
    if (!started) {
      started = true
      refreshFeatures()
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshFeatures() })
    }
    return () => { listeners.delete(setF) }
  }, [])
  return f
}
