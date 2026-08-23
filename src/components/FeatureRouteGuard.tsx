import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTenantAuth } from '../context/TenantAuthContext'
import type { FeatureKey } from '../types'

// Dipasang di dalam AuthTenantGuard (user & tenant sudah pasti ada).
// Mengecek apakah tenant mengaktifkan `featureKey` (dari tenant_features,
// diisi saat registrasi — lihat src/lib/features.ts). Kalau tidak aktif,
// redirect ke dashboard tenant ("..", sama pola-nya dengan AdminRouteGuard).
//
// Catatan: tenant lama (dibuat sebelum migration 20260824) tidak punya
// baris tenant_features sama sekali -> hasFeature() selalu false -> semua
// route yang di-gate di sini akan tertutup untuk mereka. Kalau itu bukan
// yang diinginkan, isi tenant_features untuk tenant lama lewat migration
// data terpisah sebelum deploy, jangan diam-diam dianggap "semua nyala".
export function FeatureRouteGuard({ featureKey, children }: { featureKey: FeatureKey; children: ReactNode }) {
  const { hasFeature, featuresLoaded, loading } = useTenantAuth()
  if (loading || !featuresLoaded) return <div style={{ padding: 24 }}>Memuat...</div>
  if (!hasFeature(featureKey)) return <Navigate to=".." replace />
  return <>{children}</>
}
