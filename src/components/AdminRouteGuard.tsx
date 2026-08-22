import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useTenantAuth } from '../context/TenantAuthContext'

// Dipasang DI DALAM AuthTenantGuard, jadi user & tenant membership
// sudah pasti ada di titik ini. Guard ini hanya menambahkan lapisan
// role check: hanya owner/admin yang boleh masuk halaman admin-only.
//
// Catatan navigasi: "admin" adalah fixed path segment (beda dengan
// route "*" di App.tsx yang splat), jadi relative "." di sini akan
// resolve balik ke /admin itu sendiri, bukan ke dashboard. Pakai
// ".." untuk naik satu level ke base Layout (index/Dashboard) —
// ini bekerja benar baik di "/" maupun "/t/:slug/" tanpa perlu tahu
// slug secara eksplisit.
export function AdminRouteGuard({ children }: { children: ReactNode }) {
  const { canAdmin, loading } = useTenantAuth()
  if (loading) return <div style={{ padding: 24 }}>Memuat...</div>
  if (!canAdmin) return <Navigate to=".." replace />
  return <>{children}</>
}
