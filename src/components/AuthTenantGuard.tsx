import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useTenantAuth } from '../context/TenantAuthContext'
import { isSupabaseEnabled } from '../lib/supabase'

export function AuthTenantGuard({ children }: { children: ReactNode }) {
  const { loading, isAuthenticated, user } = useTenantAuth()
  const location = useLocation()
  if (!isSupabaseEnabled()) return <div style={{ padding: 24 }}>Supabase production belum dikonfigurasi.</div>
  if (loading) return <div style={{ padding: 24 }}>Memuat sesi...</div>
  if (!user) return <Navigate replace to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} />
  if (!isAuthenticated) return <div style={{ padding: 24 }}>Akun belum memiliki akses tenant.</div>
  return <>{children}</>
}
