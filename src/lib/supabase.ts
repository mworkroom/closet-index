import { createClient, type User } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export const CLOSET_WORKSPACE_ID =
  import.meta.env.VITE_CLOSET_WORKSPACE_ID?.trim() ??
  '00000000-0000-0000-0000-000000000003'

export const isDemoMode =
  import.meta.env.VITE_DEMO_MODE === 'true' || !url || !publishableKey

export const supabase = isDemoMode
  ? null
  : createClient(url!, publishableKey!, {
      auth: {
        flowType: 'pkce',
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
      },
    })

export async function signInWithGoogle() {
  if (!supabase) return
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.origin,
    },
  })
  if (error) throw error
}

export async function signOut() {
  if (!supabase) return
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function checkAppAccess(user: User) {
  if (!supabase) return true
  const { data, error } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', CLOSET_WORKSPACE_ID)
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) throw error
  return Boolean(data)
}
