// Vercel function: builds the app's install file (name + home-screen icon) from the admin's settings.
// Only public data is used: the same public address and publishable key the website already uses.
const SUPABASE_URL = 'https://jrzwxwcakhjlebtsfhno.supabase.co'
const KEY = 'sb_publishable_Xex0Fd7YNqeZy_11SaOj6w_cmgymINs'

export default async function handler(req, res) {
  let name = 'MER Munshi Chat'
  let logo = ''
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_branding`, {
      method: 'POST',
      headers: { apikey: KEY, 'Content-Type': 'application/json' },
      body: '{}',
    })
    if (r.ok) {
      const d = await r.json()
      if (d && d.name) name = String(d.name)
      if (d && d.logo_path) logo = `${SUPABASE_URL}/storage/v1/object/public/branding/${d.logo_path}`
    }
  } catch (e) {
    // keep the defaults
  }

  const icons = logo
    ? [
        { src: logo, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: logo, sizes: '512x512', type: 'image/png', purpose: 'any' },
      ]
    : [
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]

  const manifest = {
    id: '/',
    name,
    short_name: name.slice(0, 12),
    description: 'Private messaging with usernames',
    start_url: '/#/chat',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#fdfdfd',
    theme_color: '#fdfdfd',
    icons,
  }

  res.setHeader('Content-Type', 'application/manifest+json')
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=600')
  res.status(200).send(JSON.stringify(manifest))
}
