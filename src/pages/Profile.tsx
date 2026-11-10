import { ChangeEvent, useEffect, useState } from 'react'
import Avatar from '../components/Avatar'
import { supabase } from '../lib/supabase'
import { clearCache } from '../lib/offline'
import { outboxClear, outboxCount } from '../lib/outbox'
import { setPresencePrefs, usePresence } from '../lib/presence'
import { useFeatures } from '../lib/features'

// Shrink a photo to at most 256 px before upload (small and fast on mobile data)
async function shrink(file: File, max = 256): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height))
  const c = document.createElement('canvas')
  c.width = Math.round(bmp.width * s)
  c.height = Math.round(bmp.height * s)
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height)
  return new Promise((res, rej) =>
    c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process the image'))), 'image/jpeg', 0.85))
}

export default function Profile() {
  const pres = usePresence()
  const fx = useFeatures()
  const f = (k: string) => fx[k] !== false
  const [uid, setUid] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<string | null>(null)
  const [admin, setAdmin] = useState(false)
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const [anns, setAnns] = useState<{ id: string; body: string; created_at: string }[]>([])

  useEffect(() => {
    const sb = supabase
    if (!sb) { window.location.hash = '/login'; return }
    ;(async () => {
      const { data } = await sb.auth.getUser()
      if (!data.user) { window.location.hash = '/login'; return }
      setUid(data.user.id)
      const { data: p } = await sb.from('profiles').select('username, avatar_path').eq('id', data.user.id).maybeSingle()
      if (!p) { window.location.hash = '/onboarding'; return }
      setName(p.username); setAvatar(p.avatar_path)
      const { data: a } = await sb.rpc('am_i_admin')
      setAdmin(a === true)
      const { data: an } = await sb.from('announcements').select('id, body, created_at').order('created_at', { ascending: false }).limit(10)
      setAnns((an ?? []) as any[])
    })()
  }, [])

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f || !supabase || !uid) return
    if (!f.type.startsWith('image/')) { setMsg('Please choose an image.'); return }
    setBusy(true); setMsg('')
    try {
      const blob = await shrink(f)
      const path = `${uid}/${crypto.randomUUID()}.jpg`
      const up = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { error } = await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid)
      if (error) throw error
      if (avatar) await supabase.storage.from('avatars').remove([avatar])
      setAvatar(path)
    } catch (er: any) { setMsg(er?.message ?? String(er)) }
    setBusy(false)
  }

  async function removePhoto() {
    if (!supabase || !uid || !avatar) return
    setBusy(true)
    await supabase.from('profiles').update({ avatar_path: null }).eq('id', uid)
    await supabase.storage.from('avatars').remove([avatar])
    setAvatar(null); setBusy(false)
  }

  async function signOut() {
    if ((await outboxCount()) > 0 && !window.confirm('You have unsent messages. If you sign out, they will be deleted. Sign out anyway?')) return
    await supabase?.auth.signOut()
    clearCache()
    await outboxClear()
    window.location.hash = '/'
  }

  async function deleteAccount() {
    if (!supabase) return
    const typed = window.prompt(
      `This permanently deletes your account, your messages and your files for everyone. Type your username (${name}) to confirm.`)
    if (typed !== name) return
    setBusy(true); setMsg('')
    const { error } = await supabase.functions.invoke('cleanup', { body: { action: 'delete_account' } })
    if (error) { setBusy(false); setMsg(error.message); return }
    await supabase.auth.signOut()
    clearCache()
    await outboxClear()
    window.location.hash = '/'
  }

  return (
    <div className="mx-auto min-h-full max-w-md px-6 py-6">
      <a href="#/chat" className="text-gold-200">&larr; Back to chats</a>
      <div className="mt-6 flex flex-col items-center gap-3">
        <Avatar path={avatar} name={name || '?'} size={110} />
        <p className="text-xl">@{name}</p>
        {f('profile_photo') && (
          <div className="flex gap-3">
            <label className="btn-gold cursor-pointer px-4 py-2 text-sm">
              {avatar ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
            </label>
            {avatar && <button onClick={removePhoto} disabled={busy} className="btn-ghost px-4 py-2 text-sm">Remove</button>}
          </div>
        )}
        <p className="text-center text-xs text-silver-500">
          Your photo is visible to other signed-in users. Your username cannot be changed here.
        </p>
      </div>
      {msg && <p role="alert" className="mt-4 text-center text-sm text-gold-200">{msg}</p>}

      {f('online') && (
      <div className="mt-8 space-y-2 text-sm">
        <h2 className="text-lg text-gold-200">Privacy</h2>
        <label className="flex items-center gap-3 rounded-xl bg-navy-900 p-3">
          <input type="checkbox" checked={pres.showOnline} onChange={(e) => setPresencePrefs({ showOnline: e.target.checked })} />
          Show when I am online
        </label>
        <label className="flex items-center gap-3 rounded-xl bg-navy-900 p-3">
          <input type="checkbox" checked={pres.showLast} onChange={(e) => setPresencePrefs({ showLast: e.target.checked })} />
          Show my last seen
        </label>
        <p className="text-xs text-silver-500">If you turn these off, you also cannot see other people's status.</p>
      </div>
      )}

      {anns.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg text-gold-200">Updates</h2>
          <ul className="mt-2 space-y-2 text-sm">
            {anns.map((a) => (
              <li key={a.id} className="rounded-xl bg-navy-900 p-3">
                <p className="text-xs text-silver-500">{new Date(a.created_at).toLocaleDateString()}</p>
                <p className="mt-1 whitespace-pre-wrap break-words">{a.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 space-y-3 text-sm">
        <p className="text-silver-300">
          Tip: inside a chat, open the menu and choose "Rename this person" to give someone a name only you can see.
          Double-tap a message for a quick heart.
        </p>
        {admin && <a href="#/admin" className="btn-ghost w-full">Admin panel</a>}
        <a href="#/privacy" className="block text-center text-silver-300 underline">Privacy policy</a>
        <a href="#/terms" className="block text-center text-silver-300 underline">Terms of service</a>
        <button onClick={signOut} className="btn-ghost w-full">Sign out</button>
        <button onClick={deleteAccount} disabled={busy} className="w-full rounded-full border border-red-400/60 px-6 py-3 font-semibold text-red-300">
          Delete my account
        </button>
      </div>
    </div>
  )
}
