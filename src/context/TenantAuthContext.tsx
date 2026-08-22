import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase, isSupabaseEnabled } from '../lib/supabase'

export type TenantMembership = {
  tenant_id: string
  user_id: string
  role: 'owner' | 'admin' | 'staff'
  tenant?: { id: string; slug: string; name: string }
}

type TenantAuthValue = {
  user: any | null
  membership: TenantMembership | null
  tenantId: string | null
  loading: boolean
  isAuthenticated: boolean
  canAdmin: boolean
  refresh: (requestedSlug?: string) => Promise<void>
  signOut: () => Promise<void>
}

// Bersihkan localStorage tenant-scoped (aiwaku_v5_*) saat logout,
// supaya sesi berikutnya (user lain di device yang sama) tidak
// mewarisi data tenant sebelumnya.
function clearScopedStorage() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('aiwaku_v5_'))
    keys.forEach(k => localStorage.removeItem(k))
  } catch {
    // localStorage tidak tersedia (mis. private mode) — abaikan
  }
}

const TenantAuthContext = createContext<TenantAuthValue | null>(null)

export function TenantAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any | null>(null)
  const [membership, setMembership] = useState<TenantMembership | null>(null)
  const [loading, setLoading] = useState(isSupabaseEnabled())

  const refresh = useCallback(async (requestedSlug?: string) => {
    if (!isSupabaseEnabled()) {
      setUser(null)
      setMembership(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: auth } = await supabase!.auth.getUser()
    setUser(auth.user ?? null)
    if (auth.user) {
      let query = supabase!
        .from('tenant_members')
        .select('tenant_id,user_id,role,tenant:tenants(id,slug,name)')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: true })
      const { data } = await query
      type RawRow = { tenant_id: string; user_id: string; role: TenantMembership['role']; tenant: TenantMembership['tenant'][] | TenantMembership['tenant'] | null }
      const rows = ((data || []) as unknown as RawRow[]).map(r => ({
        ...r,
        tenant: Array.isArray(r.tenant) ? r.tenant[0] : r.tenant ?? undefined,
      })) as TenantMembership[]
      const match = requestedSlug ? rows.find(m => m.tenant?.slug === requestedSlug) : rows[0]
      setMembership(match ?? null)
    } else {
      setMembership(null)
    }
    setLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    if (isSupabaseEnabled()) {
      await supabase!.auth.signOut()
    }
    setUser(null)
    setMembership(null)
    clearScopedStorage()
  }, [])

  useEffect(() => {
    refresh()
    if (!isSupabaseEnabled()) return
    const { data } = supabase!.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setMembership(null)
        clearScopedStorage()
        setLoading(false)
        return
      }
      void refresh()
    })
    return () => data.subscription.unsubscribe()
  }, [refresh])

  const value = useMemo(() => ({
    user,
    membership,
    tenantId: membership?.tenant_id ?? null,
    loading,
    isAuthenticated: !!user && !!membership,
    canAdmin: membership?.role === 'owner' || membership?.role === 'admin',
    refresh,
    signOut,
  }), [user, membership, loading, signOut])

  return <TenantAuthContext.Provider value={value}>{children}</TenantAuthContext.Provider>
}

export function useTenantAuth() {
  const value = useContext(TenantAuthContext)
  if (!value) throw new Error('useTenantAuth must be used inside TenantAuthProvider')
  return value
}
