
import { useState, useEffect } from 'react'
import { useTenantAuth } from './context/TenantAuthContext'
import { HashRouter, Routes, Route, useParams, Navigate } from 'react-router-dom'
import { Header } from './components/Header'
import { Sidebar } from './components/Sidebar'
import { Dashboard } from './pages/Dashboard'
import { MenuStock } from './pages/MenuStock'
import { Invoice } from './pages/Invoice'
import { AdminControl } from './pages/AdminControl'
import { LiveChat } from './pages/LiveChat'
import { Calendar } from './pages/Calendar'
import { Catalog } from './pages/Catalog'
import { Reports } from './pages/Reports'
import { Settings } from './pages/Settings'
import { Customers } from './pages/Customers'
import { Bookings } from './pages/Bookings'
import { POS } from './pages/POS'
import { KDS } from './pages/KDS'
import { Tables } from './pages/Tables'
import { Inventory } from './pages/Inventory'
import { AuthTenantGuard } from './components/AuthTenantGuard'
import { AdminRouteGuard } from './components/AdminRouteGuard'
import { Login } from './pages/Login'

// Satu layout untuk root dan /t/:slug (sebelumnya TenantLayout & RootLayout duplikat)
function Layout() {
  const { slug } = useParams()
  const [mobileOpen, setMobileOpen] = useState(false)
  const { refresh, membership, loading } = useTenantAuth()
  useEffect(() => { if (slug) void refresh(slug) }, [slug, refresh])
  if (slug && !loading && membership?.tenant?.slug !== slug) return <div className="p-6">Tenant tidak ditemukan atau akun tidak memiliki akses ke tenant ini.</div>

  return (
    <AuthTenantGuard><div className="min-h-screen bg-[#F6F7F8] text-slate-900 antialiased">
      <Header onToggleMobile={()=>setMobileOpen(!mobileOpen)} aiActive={true} />
      <div className="mx-auto max-w-[1600px] flex min-h-[calc(100vh-56px)]">
        <Sidebar mobileOpen={mobileOpen} onClose={()=>setMobileOpen(false)} />
        <main className="flex-1 min-w-0 bg-[#F6F7F8]">
          {slug && (
            <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 text-[11px] flex justify-between">
              <span>Multi-tenant: app.aiwaku.id/t/{slug} • Tenant isolation by tenant_id • Supabase Realtime enabled</span>
              <span className="font-mono">/{slug}</span>
            </div>
          )}
          <Routes>
            <Route index element={<Dashboard />} />
            <Route path="menu" element={<MenuStock />} />
            <Route path="invoices" element={<Invoice />} />
            <Route path="pos" element={<POS />} />
            <Route path="kds" element={<KDS />} />
            <Route path="tables" element={<Tables />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="admin" element={<AdminRouteGuard><AdminControl /></AdminRouteGuard>} />
            <Route path="livechat" element={<LiveChat />} />
            <Route path="calendar" element={<Calendar />} />
            <Route path="bookings" element={<Bookings />} />
            <Route path="customers" element={<Customers />} />
            <Route path="catalog" element={<Catalog />} />
            <Route path="reports" element={<Reports />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="." replace />} />
          </Routes>
        </main>
      </div>
    </div></AuthTenantGuard>
  )
}

export default function App() {
  // HashRouter: deep link & refresh tetap jalan di hosting statis
  // (Vercel/Netlify/shared hosting) tanpa perlu rewrite rule
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/t/:slug/*" element={<Layout />} />
        <Route path="/*" element={<Layout />} />
      </Routes>
    </HashRouter>
  )
}
