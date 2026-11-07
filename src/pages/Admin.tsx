import { ChangeEvent, useCallback, useEffect, useState } from 'react'
import Logo from '../components/Logo'
import { supabase } from '../lib/supabase'
import { refreshBrand } from '../lib/brand'

// Crop to a centered square and shrink, so the logo stays undistorted inside its circle
async function squareLogo(file: File, size = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file)
  const side = Math.min(bmp.width, bmp.height)
  const c = document.createElement('canvas')
  c.width = size; c.height = size
  c.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size)
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not process the image'))), 'image/png'))
}

type Phase = 'loading' | 'denied' | 'enroll' | 'verify' | 'ready'

export default function Admin() {
  const [phase, setPhase] = useState<Phase>('loading')
  const [factorId, setFactorId] = useState('')
  const [qr, setQr] = useState('')
  const [secret, setSecret] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [note, setNote] = useState('')
  const [stats, setStats] = useState<any>(null)
  const [users, setUsers] = useState<any[]>([])
  const [reports, setReports] = useState<any[]>([])
  const [audit, setAudit] = useState<any[]>([])
  const [ret, setRet] = useState('0')
  const [brandName, setBrandName] = useState('')
  const [logoPath, setLogoPath] = useState('')
  const [anns, setAnns] = useState<any[]>([])
  const [annText, setAnnText] = useState('')
  const [welcome, setWelcome] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const sb = supabase
    if (!sb) return
    const [s, u, r, a] = await Promise.all([
      sb.rpc('admin_stats'), sb.rpc('admin_list_users'), sb.rpc('admin_list_reports'), sb.rpc('admin_audit'),
    ])
    const bad = s.error || u.error || r.error || a.error
    if (bad) { setErr(bad.message); return }
    setStats(s.data); setUsers((u.data ?? []) as any[]); setReports((r.data ?? []) as any[]); setAudit((a.data ?? []) as any[])
    setRet(String((s.data as any)?.retention_days ?? 0))
    const [b, an, w] = await Promise.all([
      sb.rpc('get_branding'),
      sb.from('announcements').select('id, body, created_at').order('created_at', { ascending: false }).limit(20),
      sb.rpc('get_welcome'),
    ])
    const br = b.data as any
    if (br) { setBrandName(br.name ?? ''); setLogoPath(br.logo_path ?? '') }
    setAnns((an.data ?? []) as any[])
    setWelcome(typeof w.data === 'string' ? w.data : '')
    setPhase('ready')
  }, [])

  const init = useCallback(async () => {
    const sb = supabase
    if (!sb) { window.location.hash = '/login'; return }
    const { data: u } = await sb.auth.getUser()
    if (!u.user) { window.location.hash = '/login'; return }
    const { data: isAdmin } = await sb.rpc('am_i_admin')
    if (isAdmin !== true) { setPhase('denied'); return }
    const { data: aal } = await sb.auth.mfa.getAuthenticatorAssuranceLevel()
    if (aal?.currentLevel === 'aal2') { await load(); return }
    const { data: f } = await sb.auth.mfa.listFactors()
    const verified = f?.totp?.find((x) => x.status === 'verified')
    if (verified) { setFactorId(verified.id); setPhase('verify'); return }
    // First time: set up an authenticator app
    for (const x of f?.all ?? []) if (x.status !== 'verified') await sb.auth.mfa.unenroll({ factorId: x.id })
    const { data, error } = await sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Munshi Admin' })
    if (error || !data) { setErr(error?.message ?? 'Could not start two-step setup'); setPhase('enroll'); return }
    setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret); setPhase('enroll')
  }, [load])

  useEffect(() => { init() }, [init])

  async function verify() {
    setErr('')
    const { error } = await supabase!.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (error) { setErr(error.message); return }
    setCode('')
    await init()
  }

  async function saveRet() {
    const days = Number(ret)
    if (days > 0 && !window.confirm(
      `Messages older than ${days} days will be permanently deleted for everyone, from the database and file storage. Continue?`)) return
    const { error } = await supabase!.rpc('admin_set_retention', { days })
    setNote(error ? error.message : 'Saved.')
    if (!error) load()
  }

  async function runNow() {
    if (!window.confirm('Run the cleanup now? Old messages will be deleted permanently.')) return
    setNote('Running...')
    const { data, error } = await supabase!.functions.invoke('cleanup', { body: { action: 'run_retention' } })
    if (error) { setNote(error.message); return }
    setNote(data?.skipped ? 'Automatic deletion is off.' : `Deleted ${data?.deleted ?? 0} messages and ${data?.files ?? 0} files.`)
    load()
  }

  async function saveName() {
    const { error } = await supabase!.rpc('admin_set_branding', { new_name: brandName, new_logo: null })
    setNote(error ? error.message : 'Name saved. Everyone sees it the next time the app opens.')
    if (!error) refreshBrand()
  }

  async function pickLogo(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    const sb = supabase
    if (!f || !sb) return
    if (!f.type.startsWith('image/')) { setNote('Please choose an image.'); return }
    setBusy(true); setNote('')
    try {
      const blob = await squareLogo(f)
      const path = `${crypto.randomUUID()}.png`
      const up = await sb.storage.from('branding').upload(path, blob, { contentType: 'image/png' })
      if (up.error) throw up.error
      const { error } = await sb.rpc('admin_set_branding', { new_name: brandName, new_logo: path })
      if (error) throw error
      if (logoPath) await sb.storage.from('branding').remove([logoPath])
      setLogoPath(path)
      await refreshBrand()
      setNote('Logo changed. Everyone sees it the next time the app opens.')
    } catch (er: any) { setNote(er?.message ?? String(er)) }
    setBusy(false)
  }

  async function resetLogo() {
    const sb = supabase
    if (!sb || !window.confirm('Go back to the original logo?')) return
    const { error } = await sb.rpc('admin_set_branding', { new_name: brandName, new_logo: '' })
    if (error) { setNote(error.message); return }
    if (logoPath) await sb.storage.from('branding').remove([logoPath])
    setLogoPath('')
    await refreshBrand()
    setNote('Original logo restored.')
  }

  async function saveWelcome(txt: string) {
    const { error } = await supabase!.rpc('admin_set_welcome', { txt })
    setNote(error ? error.message : txt ? 'Welcome message saved.' : 'Welcome message reset to the default.')
    if (!error) load()
  }

  async function postAnn() {
    if (!window.confirm('Send this message to ALL users?')) return
    const { error } = await supabase!.rpc('admin_post_announcement', { msg: annText })
    if (error) { setNote(error.message); return }
    setAnnText(''); setNote('Sent to all users.'); load()
  }

  async function delAnn(id: string) {
    if (!window.confirm('Delete this announcement for everyone?')) return
    const { error } = await supabase!.rpc('admin_delete_announcement', { aid: id })
    if (error) setNote(error.message); else load()
  }

  async function suspend(id: string, flag: boolean) {
    const { error } = await supabase!.rpc('admin_set_suspended', { target: id, flag })
    if (error) setNote(error.message); else load()
  }

  async function setReport(id: string, status: string) {
    const { error } = await supabase!.rpc('admin_set_report_status', { rid: id, new_status: status })
    if (error) setNote(error.message); else load()
  }

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto min-h-full max-w-2xl px-4 py-6">
      <div className="flex items-center gap-3">
        <Logo size={44} />
        <h1 className="flex-1 font-display text-2xl text-gold-200">Admin</h1>
        <a href="#/chat" className="text-sm text-gold-200 underline">Back to chats</a>
      </div>
      {err && <p role="alert" className="mt-3 text-sm text-red-300">{err}</p>}
      {children}
    </div>
  )

  if (phase === 'loading') return shell(<p className="mt-6 text-silver-300">Loading...</p>)
  if (phase === 'denied') return shell(<p className="mt-6 text-silver-300">You do not have access to this page.</p>)

  if (phase === 'enroll' || phase === 'verify') {
    return shell(
      <div className="mt-6 space-y-3">
        <h2 className="text-lg text-gold-200">Two-step verification</h2>
        {phase === 'enroll' ? (
          <>
            <p className="text-sm text-silver-300">
              Install an authenticator app (Google Authenticator, Microsoft Authenticator or Aegis). Choose "Enter a setup key" and type this key, then enter the 6-digit code it shows.
            </p>
            {secret && <p className="break-all rounded-xl bg-navy-900 p-3 font-mono text-sm">{secret}</p>}
            {qr && <img src={qr} alt="QR code" className="mx-auto h-40 w-40 rounded-lg bg-white p-2" />}
          </>
        ) : (
          <p className="text-sm text-silver-300">Enter the 6-digit code from your authenticator app.</p>
        )}
        <input className="field" inputMode="numeric" maxLength={6} value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
        <button onClick={verify} disabled={code.length !== 6} className="btn-gold w-full disabled:opacity-40">Verify</button>
      </div>)
  }

  return shell(
    <>
      <p className="mt-2 text-xs text-silver-500">Admins cannot read message text from this panel.</p>
      {stats && (
        <div className="mt-4 grid grid-cols-2 gap-3 text-center">
          {[['Users', stats.users], ['Suspended', stats.suspended], ['Chats', stats.conversations],
            ['Messages', stats.messages], ['Open reports', stats.open_reports]].map(([k, v]) => (
            <div key={String(k)} className="rounded-xl bg-navy-900 p-3">
              <p className="text-2xl text-gold-200">{String(v)}</p><p className="text-xs text-silver-300">{k}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="mt-8 text-lg text-gold-200">Automatic deletion of old messages</h2>
      <p className="text-xs text-silver-500">Applies to every user. Deleted messages and files cannot be recovered.</p>
      <div className="mt-2 space-y-2">
        {[['0', 'Off (keep all messages)'], ['3', 'Delete after 3 days'], ['10', 'Delete after 10 days'], ['30', 'Delete after 1 month']].map(([v, label]) => (
          <label key={v} className="flex items-center gap-3 rounded-xl bg-navy-900 p-3">
            <input type="radio" name="ret" checked={ret === v} onChange={() => setRet(v)} />
            {label}
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-3">
        <button onClick={saveRet} className="btn-gold flex-1">Save</button>
        <button onClick={runNow} className="btn-ghost flex-1">Run cleanup now</button>
      </div>
      {note && <p className="mt-2 text-sm text-gold-200">{note}</p>}

      <h2 className="mt-8 text-lg text-gold-200">App name and logo</h2>
      <p className="text-xs text-silver-500">Shown everywhere inside the app. A square picture works best; it is shown inside a circle.</p>
      <div className="mt-2 flex items-center gap-3">
        <Logo size={64} />
        <label className="btn-gold cursor-pointer px-4 py-2 text-sm">
          Change logo
          <input type="file" accept="image/*" className="hidden" onChange={pickLogo} disabled={busy} />
        </label>
        {logoPath && <button onClick={resetLogo} className="btn-ghost px-4 py-2 text-sm">Use original</button>}
      </div>
      <input className="field mt-3" value={brandName} maxLength={40} onChange={(e) => setBrandName(e.target.value)} placeholder="App name" />
      <button onClick={saveName} disabled={!brandName.trim()} className="btn-gold mt-2 w-full disabled:opacity-40">Save name</button>
      <p className="mt-1 text-xs text-silver-500">
        The icon and name on phone home screens come from the install file, so they change only after an update and reinstall.
      </p>

      <h2 className="mt-8 text-lg text-gold-200">Welcome message for new users</h2>
      <p className="text-xs text-silver-500">New users get this as the first message in the official chat. It shows the default text until you change it.</p>
      <textarea className="field mt-2 h-28" maxLength={1000} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
      <div className="mt-2 flex gap-3">
        <button onClick={() => saveWelcome(welcome)} disabled={!welcome.trim()} className="btn-gold flex-1 disabled:opacity-40">Save welcome</button>
        <button onClick={() => saveWelcome('')} className="btn-ghost flex-1">Use default</button>
      </div>

      <h2 className="mt-8 text-lg text-gold-200">Message all users</h2>
      <p className="text-xs text-silver-500">Appears as a chat from the app name in everyone's chat list. Good for app updates.</p>
      <textarea className="field mt-2 h-28" maxLength={1000} value={annText} onChange={(e) => setAnnText(e.target.value)} placeholder="Write an update for all users" />
      <button onClick={postAnn} disabled={!annText.trim()} className="btn-gold mt-2 w-full disabled:opacity-40">Send to all users</button>
      <ul className="mt-3 space-y-2 text-sm">
        {anns.map((a) => (
          <li key={a.id} className="rounded-xl bg-navy-900 p-3">
            <p className="text-xs text-silver-500">{new Date(a.created_at).toLocaleString()}</p>
            <p className="mt-1 whitespace-pre-wrap break-words">{a.body}</p>
            <button onClick={() => delAnn(a.id)} className="mt-2 text-xs text-red-300 underline">Delete</button>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg text-gold-200">Reports</h2>
      {reports.length === 0 && <p className="text-sm text-silver-500">No reports.</p>}
      <ul className="space-y-2">
        {reports.map((r) => (
          <li key={r.id} className="rounded-xl bg-navy-900 p-3 text-sm">
            <p><b>@{r.reporter}</b> reported <b>@{r.reported ?? 'deleted user'}</b></p>
            <p className="mt-1 text-silver-300">{r.reason}</p>
            <div className="mt-2 flex gap-2 text-xs">
              {['open', 'reviewing', 'closed'].map((s) => (
                <button key={s} onClick={() => setReport(r.id, s)}
                  className={`rounded-full border px-3 py-1 ${r.status === s ? 'border-gold-400 text-gold-200' : 'border-navy-700 text-silver-300'}`}>{s}</button>
              ))}
            </div>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg text-gold-200">Users</h2>
      <ul className="space-y-2">
        {users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 rounded-xl bg-navy-900 p-3 text-sm">
            <span className="min-w-0 flex-1">
              <b>@{u.username}</b>{u.suspended && <span className="ml-2 text-red-300">suspended</span>}
              <span className="block text-xs text-silver-500">{new Date(u.created_at).toLocaleDateString()} &middot; {u.message_count} messages</span>
            </span>
            <button onClick={() => suspend(u.id, !u.suspended)}
              className="rounded-full border border-gold-400/60 px-3 py-1 text-xs text-gold-200">
              {u.suspended ? 'Unsuspend' : 'Suspend'}
            </button>
          </li>
        ))}
      </ul>

      <h2 className="mt-8 text-lg text-gold-200">Audit log</h2>
      <ul className="mb-10 space-y-1 text-xs text-silver-300">
        {audit.map((a, i) => (
          <li key={i} className="rounded-lg bg-navy-900 p-2">
            {new Date(a.created_at).toLocaleString()} &middot; {a.admin} &middot; {a.action}
            {a.details ? ` ${JSON.stringify(a.details)}` : ''}
          </li>
        ))}
      </ul>
    </>)
}
