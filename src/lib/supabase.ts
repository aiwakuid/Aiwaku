
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = url && anon ? createClient(url, anon) : null

export function isSupabaseEnabled() {
  return !!supabase
}

// Realtime helper
export function subscribeToTable(table: string, tenantId: string, onChange: (payload: any) => void) {
  if (!supabase) return { unsubscribe: () => {} }
  
  const channel = supabase
    .channel(`${table}_${tenantId}`)
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table,
      filter: `tenant_id=eq.${tenantId}`
    }, onChange)
    .subscribe()
  
  return { unsubscribe: () => supabase.removeChannel(channel) }
}

// Multi-tenant: get tenant by slug from URL /t/:slug
export async function getTenantBySlug(slug: string) {
  if (!supabase) return null
  const { data, error } = await supabase.from('tenants').select('*').eq('slug', slug).eq('is_active', true).maybeSingle()
  if (error) throw error
  return data
}
