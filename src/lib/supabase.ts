import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://jrzwxwcakhjlebtsfhno.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Xex0Fd7YNqeZy_11SaOj6w_cmgymINs'

// Public (publishable) key only. Row Level Security protects the data.
export const backendConfigured = Boolean(url && key)
export const supabase = backendConfigured ? createClient(url, key) : null
