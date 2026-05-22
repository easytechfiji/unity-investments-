import './env.js'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY

export function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) return null

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

const supabase = createSupabaseClient()

export default supabase
