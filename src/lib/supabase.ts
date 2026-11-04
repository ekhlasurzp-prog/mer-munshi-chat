import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

// Only the public anon key is used here. Row Level Security (Phase 3) protects the data.
export const backendConfigured = Boolean(url && key)
export const supabase = backendConfigured ? createClient(url!, key!) : null
