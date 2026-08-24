import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
  tenantFeatures: Set<string>
  featuresLoaded: boolean
  hasFeature: (key: string) => boolean
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
  const [tenantFeatures, setTenantFeatures] = useState<Set<string>>(new Set())
  const [featuresLoaded, setFeaturesLoaded] = useState(false)
  const refreshSeq = useRef(0)

  const refresh = useCallback(async (requestedSlug?: string) => {
    const seq = ++refreshSeq.current
    if (!isSupabaseEnabled()) {
      if (seq !== refreshSeq.current) return
      setUser(null)
      setMembership(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const { data: auth } = await supabase!.auth.getUser()
    if (seq !== refreshSeq.current) return
    setUser(auth.user ?? null)
    if (auth.user) {
      let query = supabase!
        .from('tenant_members')
        .select('tenant_id,user_id,role,tenant:tenants(id,slug,name)')
        .eq('user_id', auth.user.id)
        .order('created_at', { ascending: true })
      const { data } = await query
      if (seq !== refreshSeq.current) return
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
    if (seq === refreshSeq.current) setLoading(false)
  }, [])

  const signOut = useCallback(async () => {
    if (isSupabaseEnabled()) {
      await supabase!.auth.signOut()
    }
    setUser(null)
    setMembership(null)
    setTenantFeatures(new Set())
    setFeaturesLoaded(false)
    clearScopedStorage()
  }, [])

  const tenantId = membership?.tenant_id ?? null

  useEffect(() => {
    let cancelled = false
    if (!tenantId || !isSupabaseEnabled()) {
      setTenantFeatures(new Set())
      // Kalau tidak ada Supabase/tenant, anggap "loaded" (kosong) supaya
      // guard tidak nyangkut nunggu selamanya di environment tanpa backend.
      setFeaturesLoaded(!isSupabaseEnabled())
      return
    }
    setFeaturesLoaded(false)
    supabase!
      .from('tenant_features')
      .select('feature_key,enabled')
      .eq('tenant_id', tenantId)
      .then(({ data, error }) => {
        if (cancelled) return
        if (!error && data) {
          setTenantFeatures(new Set((data as { feature_key: string; enabled: boolean }[]).filter(f => f.enabled).map(f => f.feature_key)))
        }
        setFeaturesLoaded(true)
      })
    return () => { cancelled = true }
  }, [tenantId])

  useEffect(() => {
    refresh()
    if (!isSupabaseEnabled()) return
    const { data } = supabase!.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        refreshSeq.current += 1
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

  const hasFeature = useCallback((key: string) => tenantFeatures.has(key), [tenantFeatures])

  const value = useMemo(() => ({
    user,
    membership,
    tenantId,
    loading,
    isAuthenticated: !!user && !!membership,
    canAdmin: membership?.role === 'owner' || membership?.role === 'admin',
    tenantFeatures,
    featuresLoaded,
    hasFeature,
    refresh,
    signOut,
  }), [user, membership, tenantId, loading, tenantFeatures, featuresLoaded, hasFeature, refresh, signOut])

  return <TenantAuthContext.Provider value={value}>{children}</TenantAuthContext.Provider>
}

export function useTenantAuth() {
  const value = useContext(TenantAuthContext)
  if (!value) throw new Error('useTenantAuth must be used inside TenantAuthProvider')
  return value
}
