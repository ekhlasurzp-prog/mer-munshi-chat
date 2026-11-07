import { useEffect, useState } from 'react'
import { useBrand } from '../lib/brand'

// The logo is shown as a circle and is never stretched.
// The admin can replace it; if it cannot load (for example offline) the built-in logo is used.
export default function Logo({ size = 48, glow = false }: { size?: number; glow?: boolean }) {
  const brand = useBrand()
  const [bad, setBad] = useState(false)
  useEffect(() => { setBad(false) }, [brand.logo])
  const src = brand.logo && !bad ? brand.logo : '/logo.png'
  return (
    <img
      src={src}
      onError={() => setBad(true)}
      alt={`${brand.name} logo`}
      width={size}
      height={size}
      className={`rounded-full object-cover ${glow ? 'shadow-gold' : ''}`}
      style={{ width: size, height: size }}
    />
  )
}
