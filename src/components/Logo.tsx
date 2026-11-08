import { useEffect, useState } from 'react'
import { useBrand } from '../lib/brand'

export default function Logo({ size = 48, glow = false }: { size?: number; glow?: boolean }) {
  const brand = useBrand()
  const [bad, setBad] = useState(false)
  useEffect(() => { setBad(false) }, [brand.logo])
  const src = brand.logoData || (brand.logo && !bad ? brand.logo : '/logo.png')
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