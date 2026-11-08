// Small colored dot next to a message: red = sending, yellow = sent, green = seen.
const KINDS = {
  sending: { color: 'bg-red-500', label: 'Sending' },
  failed: { color: 'bg-red-500', label: 'Failed' },
  sent: { color: 'bg-yellow-400', label: 'Sent' },
  seen: { color: 'bg-green-500', label: 'Seen' },
} as const

export default function StatusDot({ kind }: { kind: keyof typeof KINDS }) {
  const k = KINDS[kind]
  return (
    <span role="img" aria-label={k.label} title={k.label}
      className={`inline-block h-2.5 w-2.5 rounded-full ring-1 ring-white/70 ${k.color}`} />
  )
}
