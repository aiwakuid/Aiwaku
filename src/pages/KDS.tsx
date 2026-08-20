import { useEffect, useMemo, useState } from 'react'
import { Check, ChefHat, Clock3, RefreshCw, Utensils, X } from 'lucide-react'
import { supabase, isSupabaseEnabled } from '../lib/supabase'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useTenant } from '../hooks/useTenant'
import type { Order } from '../types'

type KitchenStatus = 'new' | 'preparing' | 'ready' | 'served' | 'cancelled'

const statusLabel: Record<KitchenStatus, string> = {
  new: 'Pesanan baru', preparing: 'Sedang dibuat', ready: 'Siap', served: 'Disajikan', cancelled: 'Dibatalkan'
}

const money = (n: number) => `Rp${Number(n || 0).toLocaleString('id-ID')}`

function dineInMeta(text?: string) {
  try { return text ? JSON.parse(text) as { mode?: string; table?: string } : {} } catch { return {} }
}

function elapsed(iso: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000))
  return minutes < 1 ? 'baru saja' : `${minutes} menit`
}

export function KDS() {
  const { tenantId: authTenantId } = useTenantAuth()
  const { tenant } = useTenant()
  const tenantId = authTenantId || tenant.id
  const [orders, setOrders] = useState<Order[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  async function load() {
    if (!isSupabaseEnabled() || !tenantId) return
    setLoading(true)
    const { data, error } = await supabase!
      .from('orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('fulfillment_status', ['new', 'preparing', 'ready'])
      .order('created_at', { ascending: true })
    if (!error) setOrders((data || []) as Order[])
    setLoading(false)
  }

  useEffect(() => { void load() }, [tenantId])
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000)
    return () => window.clearInterval(timer)
  }, [])
  useEffect(() => {
    if (!isSupabaseEnabled() || !tenantId) return
    const channel = supabase!.channel(`kds-${tenantId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` }, () => { void load() })
      .subscribe()
    return () => { void supabase!.removeChannel(channel) }
  }, [tenantId])

  async function move(orderId: string, status: KitchenStatus) {
    setBusyId(orderId)
    try {
      const { data, error } = await supabase!.rpc('kitchen_update_order_status', { p_order_id: orderId, p_status: status })
      if (error) throw error
      if (status === 'served' || status === 'cancelled') setOrders(prev => prev.filter(o => o.id !== orderId))
      else setOrders(prev => prev.map(o => o.id === orderId ? data as Order : o))
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Status pesanan belum berubah.')
    } finally { setBusyId(null) }
  }

  const columns = useMemo(() => ({
    new: orders.filter(o => (o.fulfillment_status || 'new') === 'new'),
    preparing: orders.filter(o => o.fulfillment_status === 'preparing'),
    ready: orders.filter(o => o.fulfillment_status === 'ready'),
  }), [orders])

  const renderCard = (order: Order) => {
    const status = (order.fulfillment_status || 'new') as KitchenStatus
    return <article key={order.id} className="rounded-3xl border bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div><div className="text-lg font-black tracking-tight">{order.invoice_no}</div><div className="text-[11px] text-slate-500">{order.customer_name || 'Walk-in'} · {elapsed(order.created_at)} {dineInMeta(order.custom_text).table ? `· ${dineInMeta(order.custom_text).table}` : ''}</div></div>
        <div className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold">{statusLabel[status]}</div>
      </div>
      <div className="mt-4 space-y-2">
        {(order.items || []).map((item, i) => <div key={`${item.menu_id}-${i}`} className="flex gap-3 rounded-2xl bg-slate-50 p-3"><span className="w-7 h-7 rounded-lg bg-white grid place-items-center font-black text-sm">{item.qty}×</span><div className="min-w-0"><div className="font-semibold text-sm">{item.name}</div><div className="text-[10px] text-slate-400">{money(item.price)}</div></div></div>)}
      </div>
      {(() => { const meta = dineInMeta(order.custom_text); const label = meta.mode === 'dine-in' && meta.table ? `Dine-in · ${meta.table}` : meta.mode; return label ? <div className="mt-3 rounded-2xl bg-blue-50 border border-blue-100 p-3 text-[11px] font-semibold text-blue-800">{label}</div> : null })()}
      {order.custom_text && !dineInMeta(order.custom_text).mode && <div className="mt-3 rounded-2xl bg-amber-50 border border-amber-100 p-3 text-[11px] font-semibold">Catatan: {order.custom_text}</div>}
      <div className="mt-4 flex gap-2">
        {status === 'new' && <button disabled={busyId === order.id} onClick={() => move(order.id, 'preparing')} className="flex-1 h-11 rounded-2xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50"><ChefHat size={16} className="inline mr-1"/> Mulai</button>}
        {status === 'preparing' && <button disabled={busyId === order.id} onClick={() => move(order.id, 'ready')} className="flex-1 h-11 rounded-2xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"><Check size={16} className="inline mr-1"/> Siap</button>}
        {status === 'ready' && <button disabled={busyId === order.id} onClick={() => move(order.id, 'served')} className="flex-1 h-11 rounded-2xl bg-slate-900 text-white text-xs font-bold disabled:opacity-50"><Utensils size={16} className="inline mr-1"/> Disajikan</button>}
        {status !== 'ready' && <button disabled={busyId === order.id} onClick={() => move(order.id, 'cancelled')} className="w-11 h-11 rounded-2xl border text-slate-400 hover:text-red-600" title="Batalkan"><X size={16}/></button>}
      </div>
    </article>
  }

  return <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
    <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
      <div><div className="text-[11px] text-slate-500">Operasional</div><h1 className="text-2xl md:text-3xl font-black tracking-tight">Kitchen Display</h1><p className="text-xs text-slate-500 mt-1">Pesanan bergerak dari baru → dibuat → siap → disajikan.</p></div>
      <button onClick={() => void load()} className="h-10 px-3 rounded-xl border bg-white text-xs font-semibold flex items-center gap-2"><RefreshCw size={15}/> Segarkan</button>
    </div>
    {!isSupabaseEnabled() && <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-800">KDS production membutuhkan Supabase.</div>}
    <div className="grid lg:grid-cols-3 gap-4">
      {([['new','Pesanan Baru',columns.new],['preparing','Sedang Dibuat',columns.preparing],['ready','Siap Disajikan',columns.ready]] as const).map(([key,title,list]) => <section key={key} className="min-h-[420px] rounded-3xl bg-slate-100/80 border p-3"><div className="flex items-center justify-between px-1 mb-3"><div className="font-bold text-sm">{title}</div><div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black">{list.length}</div></div><div className="space-y-3">{list.map(renderCard)}{!list.length && <div className="h-64 grid place-items-center text-center text-slate-400"><div><Clock3 size={24} className="mx-auto mb-2"/><div className="text-xs font-semibold">Tidak ada pesanan</div><div className="text-[10px] mt-1">Tenang, dapur aman.</div></div></div>}</div></section>)}
    </div>
    <div className="mt-4 text-[10px] text-slate-400 text-right">Diperbarui {new Date(now).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</div>
  </div>
}
