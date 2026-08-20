import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CircleDot, RefreshCw, ShoppingCart, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase, isSupabaseEnabled } from '../lib/supabase'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useTenant } from '../hooks/useTenant'
import type { Order } from '../types'

const tables = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)

function meta(text?: string) {
  try { return text ? JSON.parse(text) as { mode?: string; table?: string } : {} } catch { return {} }
}

export function Tables() {
  const navigate = useNavigate()
  const { tenantId: authTenantId } = useTenantAuth()
  const { tenant } = useTenant()
  const tenantId = authTenantId || tenant.id
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!isSupabaseEnabled() || !tenantId) { setLoading(false); return }
    setLoading(true)
    const { data, error } = await supabase!.from('orders').select('*').eq('tenant_id', tenantId).neq('status', 'batal').order('created_at', { ascending: false }).limit(100)
    if (!error) setOrders((data || []) as Order[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [tenantId])
  useEffect(() => {
    if (!isSupabaseEnabled() || !tenantId) return
    const channel = supabase!.channel(`tables-${tenantId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, () => { void load() }).subscribe()
    return () => { void supabase!.removeChannel(channel) }
  }, [tenantId])

  const occupied = useMemo(() => {
    const map = new Map<string, Order>()
    for (const order of orders) {
      const m = meta(order.custom_text)
      if (m.mode === 'dine-in' && m.table && order.fulfillment_status !== 'served' && order.fulfillment_status !== 'cancelled') {
        if (!map.has(m.table)) map.set(m.table, order)
      }
    }
    return map
  }, [orders])

  return <div className="p-4 md:p-6 max-w-[1500px] mx-auto">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div><div className="text-[11px] text-slate-500">Operasional</div><h1 className="text-2xl md:text-3xl font-black tracking-tight">Meja</h1><p className="text-xs text-slate-500 mt-1">Pilih meja, lihat pesanan aktif, lalu lanjutkan jualan tanpa alur yang rumit.</p></div>
      <button onClick={() => void load()} className="h-10 px-3 rounded-xl border bg-white text-xs font-semibold flex items-center gap-2"><RefreshCw size={15}/> Segarkan</button>
    </div>
    {!isSupabaseEnabled() && <div className="mb-4 rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">Peta meja akan membaca order nyata setelah Supabase aktif.</div>}
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
      {tables.map(table => {
        const order = occupied.get(table)
        const busy = Boolean(order)
        return <button key={table} onClick={() => navigate(`../pos`)} className={`text-left rounded-3xl border p-4 min-h-36 transition hover:-translate-y-0.5 hover:shadow-md ${busy ? 'bg-amber-50 border-amber-200' : 'bg-white hover:border-slate-300'}`}>
          <div className="flex items-start justify-between"><div className="text-xl font-black">{table}</div><CircleDot size={17} className={busy ? 'text-amber-500' : 'text-emerald-500'}/></div>
          {busy ? <><div className="mt-5 text-[11px] font-bold text-amber-800">Sedang digunakan</div><div className="text-[10px] text-slate-500 mt-1">{order?.invoice_no} · {order?.customer_name || 'Walk-in'}</div></> : <><div className="mt-5 text-[11px] font-bold text-emerald-700">Tersedia</div><div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1"><ShoppingCart size={11}/> Mulai pesanan</div></>}
          <div className="mt-3 flex items-center justify-between text-[10px] font-semibold text-slate-400"><span>{busy ? 'Buka POS' : 'Pakai meja'}</span><ArrowRight size={13}/></div>
        </button>
      })}
    </div>
    <div className="mt-5 rounded-2xl bg-white border p-4 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100 grid place-items-center"><Users size={18}/></div><div><div className="text-xs font-bold">{occupied.size} meja sedang digunakan</div><div className="text-[10px] text-slate-500">Status mengikuti pesanan dine-in yang masih aktif.</div></div>{loading && <div className="ml-auto text-[10px] text-slate-400">Memuat…</div>}</div>
  </div>
}
