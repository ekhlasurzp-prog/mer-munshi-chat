import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Avatar({ path, name, size = 44 }: { path?: string | null; name: string; size?: number }) {
  const [bad, setBad] = useState(false)
  const url = path && supabase ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : ''
  const style = { width: size, height: size }
  if (url && !bad) {
    return <img src={url} alt="" style={style} onError={() => setBad(true)} className="shrink-0 rounded-full object-cover" />
  }
  return (
    <span style={{ ...style, fontSize: size * 0.4 }}
      className="grid shrink-0 place-items-center rounded-full bg-navy-700 text-gold-200">
      {(name[0] ?? '?').toUpperCase()}
    </span>
  )
}