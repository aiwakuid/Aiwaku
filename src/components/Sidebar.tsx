import { NavLink, useParams } from 'react-router-dom'
import { LayoutDashboard, ShoppingCart, Package, PackagePlus, Users, BarChart3, Settings2, CalendarDays, Receipt, Bot, ChefHat, Table2 } from 'lucide-react'

export function Sidebar({ mobileOpen, onClose }: { mobileOpen: boolean, onClose: () => void }) {
  const { slug } = useParams()
  const basePath = slug ? `/t/${slug}` : ''
  const groups = [
    { title: 'Utama', items: [
      { to: `${basePath}/`, label: 'Beranda', icon: LayoutDashboard, end: true },
      { to: `${basePath}/pos`, label: 'Jualan', icon: ShoppingCart },
    ]},
    { title: 'Operasional', items: [
      { to: `${basePath}/menu`, label: 'Menu & Stok', icon: Package },
      { to: `${basePath}/inventory`, label: 'Persediaan', icon: PackagePlus },
      { to: `${basePath}/kds`, label: 'Kitchen', icon: ChefHat },
      { to: `${basePath}/tables`, label: 'Meja', icon: Table2 },
      { to: `${basePath}/bookings`, label: 'Booking', icon: CalendarDays },
      { to: `${basePath}/admin`, label: 'AIWAKU', icon: Bot },
    ]},
    { title: 'Bisnis', items: [
      { to: `${basePath}/customers`, label: 'Pelanggan', icon: Users },
      { to: `${basePath}/reports`, label: 'Bisnis', icon: BarChart3 },
    ]},
    { title: 'Lainnya', items: [
      { to: `${basePath}/calendar`, label: 'Kalender', icon: CalendarDays },
      { to: `${basePath}/catalog`, label: 'Katalog', icon: Receipt },
      { to: `${basePath}/settings`, label: 'Pengaturan', icon: Settings2 },
    ]},
  ]

  return (
    <>
      {mobileOpen && <div onClick={onClose} className="fixed inset-0 bg-slate-950/30 backdrop-blur-[2px] z-20 md:hidden" />}
      <aside className={`fixed md:sticky top-[64px] md:top-0 z-30 h-[calc(100vh-64px)] md:h-auto w-[248px] bg-white/95 backdrop-blur border-r border-slate-200/80 flex flex-col transition-transform ${mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}`}>
        <div className="p-3 overflow-y-auto flex-1">
          {groups.map(group => (
            <div key={group.title} className="mb-5">
              <div className="px-3 mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{group.title}</div>
              <div className="space-y-1">
                {group.items.map(it => (
                  <NavLink key={it.to} to={it.to} end={it.end as any} onClick={onClose} className={({isActive}) => `group flex items-center gap-3 px-3 h-10 rounded-xl text-[13px] font-semibold transition-all ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'}`}>
                    <it.icon size={17} strokeWidth={1.9} />
                    <span>{it.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-slate-200/80">
          <div className="rounded-2xl bg-slate-950 text-white p-3.5">
            <div className="flex items-center gap-2 text-[12px] font-bold"><span className="w-2 h-2 rounded-full bg-emerald-400" /> AIWAKU siap membantu</div>
            <div className="mt-1.5 text-[10px] leading-4 text-white/60">Tanya penjualan, stok, pelanggan, atau minta AIWAKU mengerjakan sesuatu.</div>
          </div>
        </div>
      </aside>
    </>
  )
}
