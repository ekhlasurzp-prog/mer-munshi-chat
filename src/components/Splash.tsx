import { useEffect, useRef, useState } from 'react'

const BG = '#fdfdfd' // the same white as the video background

// Plays the intro video each time the app is opened. It also works offline because the
// video file is saved on the phone by the service worker. It never holds the app for long.
export default function Splash({ onDone }: { onDone: () => void }) {
  const [src, setSrc] = useState('')
  const [fade, setFade] = useState(false)
  const ready = useRef(false)
  const finished = useRef(false)

  const finish = () => {
    if (finished.current) return
    finished.current = true
    setFade(true)
    window.setTimeout(onDone, 350)
  }

  useEffect(() => {
    // White status bar while the intro plays
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    const prev = meta?.content ?? '#050B1E'
    if (meta) meta.content = BG
    let url = ''
    let dead = false
    fetch('/splash.mp4')
      .then((r) => { if (!r.ok) throw new Error('no video'); return r.blob() })
      .then((b) => { if (dead) return; url = URL.createObjectURL(b); ready.current = true; setSrc(url) })
      .catch(() => finish())
    const notReady = window.setTimeout(() => { if (!ready.current) finish() }, 3000)
    const hardStop = window.setTimeout(finish, 6500)
    return () => {
      dead = true
      window.clearTimeout(notReady)
      window.clearTimeout(hardStop)
      if (meta) meta.content = prev
      if (url) URL.revokeObjectURL(url)
    }
  }, [])

  return (
    <div
      onClick={finish}
      style={{ background: BG, opacity: fade ? 0 : 1, transition: 'opacity 350ms' }}
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      {src && (
        <video
          src={src}
          autoPlay
          muted
          playsInline
          preload="auto"
          onLoadedData={(e) => { e.currentTarget.play().catch(() => finish()) }}
          onEnded={finish}
          onError={finish}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  )
}
