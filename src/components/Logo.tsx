// The logo is square with its own background, so it is always shown as a circle.
// Never set width and height to different values: that would distort it.
export default function Logo({ size = 48, glow = false }: { size?: number; glow?: boolean }) {
  return (
    <img
      src="/logo.png"
      alt="MER Munshi Chat logo"
      width={size}
      height={size}
      className={`rounded-full object-cover ${glow ? 'shadow-gold' : ''}`}
      style={{ width: size, height: size }}
    />
  )
}
