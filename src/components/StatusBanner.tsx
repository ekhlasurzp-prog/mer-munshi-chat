import { backendConfigured } from '../lib/supabase'

export default function StatusBanner() {
  if (backendConfigured) return null
  return (
    <p role="status" className="bg-gold-400/15 px-4 py-2 text-center text-xs text-gold-200">
      Phase 2 preview: the backend is not connected yet, so sign-in and messaging do not work.
    </p>
  )
}
