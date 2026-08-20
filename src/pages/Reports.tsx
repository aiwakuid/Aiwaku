
import { useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useTenantAuth } from '../context/TenantAuthContext'
import { loadOrders } from '../lib/storage'
import { useCustomers } from '../hooks/useCustomers'
import { TrendingUp, Package, Users, Wallet } from 'lucide-react'

function last14Days() {
  const days: string[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push(d.toISOString().split('T')[0])
  }
  return days
}

export function Reports() {
  const { slug } = useParams()
  const { tenantId } = useTenantAuth()
  const { customers } = useCustomers(tenantId ?? undefined)
  const orders = useMemo(() => loadOrders(tenantId ?? undefined), [tenantId])

  const totalRevenue = orders.reduce((s, o) => s + o.total, 0)
  const paidRevenue = orders.filter(o => o.status === 'lunas').reduce((s, o) => s + o.total, 0)
  const avgOrderValue = orders.length ? Math.round(totalRevenue / orders.length) : 0

  const days = last14Days()
  const revenueByDay = useMemo(() => {
    return days.map(day => {
      const dayTotal = orders
        .filter(o => o.created_at.split('T')[0] === day)
        .reduce((s, o) => s + o.total, 0)
      return { day, total: dayTotal }
    })
  }, [orders])
  const maxDayRevenue = Math.max(1, ...revenueByDay.map(d => d.total))

  const topItems = useMemo(() => {
    const map: Record<string, { name: string, qty: number, revenue: number }> = {}
    orders.forEach(o => o.items.forEach(it => {
      if (!map[it.name]) map[it.name] = { name: it.name, qty: 0, revenue: 0 }
      map[it.name].qty += it.qty
      map[it.name].revenue += it.subtotal
    }))
    return Object.values(map).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [orders])
  const maxItemRevenue = Math.max(1, ...topItems.map(i => i.revenue))

  const statusBreakdown = useMemo(() => {
    const statuses = ['pending', 'dp', 'lunas', 'batal'] as const
    return statuses.map(s => ({ status: s, count: orders.filter(o => o.status === s).length }))
  }, [orders])

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
      <h2 className="font-bold text-[18px]">Laporan - {slug}</h2>

      {orders.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center text-[13px] text-slate-500">
          Belum ada data order. Buat invoice dulu di halaman Invoice & Struk supaya laporan bisa dihitung.
        </div>
      ) : (
        <>
          <div className="grid md:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-[11px] text-slate-500"><Wallet size={14}/> Total Omzet</div>
              <div className="text-[18px] font-bold mt-1">Rp{totalRevenue.toLocaleString('id-ID')}</div>
            </div>
            <div className="bg-white rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-[11px] text-slate-500"><TrendingUp size={14}/> Sudah Lunas</div>
              <div className="text-[18px] font-bold mt-1">Rp{paidRevenue.toLocaleString('id-ID')}</div>
            </div>
            <div className="bg-white rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-[11px] text-slate-500"><Package size={14}/> Rata-rata / Order</div>
              <div className="text-[18px] font-bold mt-1">Rp{avgOrderValue.toLocaleString('id-ID')}</div>
            </div>
            <div className="bg-white rounded-2xl border p-4">
              <div className="flex items-center gap-2 text-[11px] text-slate-500"><Users size={14}/> Total Customer</div>
              <div className="text-[18px] font-bold mt-1">{customers.length}</div>
            </div>
          </div>

          <div className="bg-white rounded-[20px] border p-5">
            <div className="font-bold text-[13px] mb-4">Omzet 14 Hari Terakhir</div>
            <div className="flex items-end gap-1.5 h-[140px]">
              {revenueByDay.map(d => (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div className="w-full bg-slate-900 rounded-t-md hover:bg-emerald-600 transition" style={{ height: `${Math.max(4, (d.total / maxDayRevenue) * 120)}px` }} title={`Rp${d.total.toLocaleString('id-ID')}`} />
                  <span className="text-[8px] text-slate-400">{new Date(d.day).getDate()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-white rounded-[20px] border p-5">
              <div className="font-bold text-[13px] mb-3">Top 5 Produk Terlaris</div>
              <div className="space-y-3">
                {topItems.map(it => (
                  <div key={it.name}>
                    <div className="flex justify-between text-[11px] mb-1"><span className="font-medium">{it.name} <span className="text-slate-400">x{it.qty}</span></span><span>Rp{it.revenue.toLocaleString('id-ID')}</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${(it.revenue / maxItemRevenue) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-[20px] border p-5">
              <div className="font-bold text-[13px] mb-3">Status Order</div>
              <div className="space-y-2">
                {statusBreakdown.map(s => (
                  <div key={s.status} className="flex items-center justify-between text-[12px] p-2 rounded-xl bg-slate-50">
                    <span className="capitalize font-medium">{s.status}</span>
                    <span className="font-bold">{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}

      <div className="bg-slate-900 text-white rounded-2xl p-3 text-[11px]">📊 Laporan dihitung real-time dari data order (localStorage/Supabase), bukan angka dummy. Sinkron ke Google Sheets tersedia di halaman Invoice dan Pengaturan.</div>
    </div>
  )
}
