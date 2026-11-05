import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// PUBLIC push key (safe to be in the browser). The private key lives only in Supabase secrets.
const VAPID_PUBLIC = 'BBgucf_oAndh7Mue0c6m_fH-tCIXQWIbfHW7VH30WIbJl3f6wo-slDhWvmjWIT0NGQN-j6koV1HU8MxpeeqJfhI'

const toKey = (b64: string) => {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4)
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

const supported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

async function subscribe(): Promise<string> {
  if (!supabase) return 'Not connected.'
  const reg = await navigator.serviceWorker.ready
  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC) })
  }
  const j = sub.toJSON()
  const { error } = await supabase.rpc('save_push_subscription', {
    p_endpoint: j.endpoint, p_p256dh: j.keys?.p256dh, p_auth: j.keys?.auth,
  })
  return error ? error.message : ''
}

export default function NotifyBar() {
  const [perm, setPerm] = useState<NotificationPermission>(supported() ? Notification.permission : 'denied')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    if (!supported() || perm !== 'granted' || !supabase) return
    supabase.auth.getSession().then(({ data }) => { if (data.session) subscribe().catch(() => {}) })
  }, [perm])

  // When the app is opened, clear old notifications so the icon count resets
  useEffect(() => {
    if (!supported()) return
    const clear = async () => {
      if (document.visibilityState !== 'visible') return
      const reg = await navigator.serviceWorker.getRegistration()
      const list = (await reg?.getNotifications()) ?? []
      list.forEach((n) => n.close())
    }
    clear()
    document.addEventListener('visibilitychange', clear)
    return () => document.removeEventListener('visibilitychange', clear)
  }, [])

  const turnOn = useCallback(async () => {
    setMsg('')
    const p = await Notification.requestPermission()
    setPerm(p)
    if (p === 'granted') {
      try { setMsg(await subscribe()) } catch (e) { setMsg(String(e)) }
    }
  }, [])

  if (!supported() || perm === 'denied') return null
  if (perm === 'granted' && !msg) return null
  return (
    <div className="flex items-center gap-3 bg-navy-800 px-4 py-2 text-sm text-silver-100">
      <span className="flex-1">{msg ? msg : 'Get a notification when a new message arrives.'}</span>
      {perm === 'default' && <button onClick={turnOn} className="rounded-full bg-gold-400 px-4 py-1 font-semibold text-navy-950">Turn on</button>}
    </div>
  )
}
