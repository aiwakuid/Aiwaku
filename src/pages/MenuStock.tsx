
import { useState } from 'react'
import { useMenus } from '../hooks/useMenus'
import { useTenantAuth } from '../context/TenantAuthContext'
import { Search } from 'lucide-react'

export function MenuStock() {
  const { tenantId } = useTenantAuth()
  const { menus, addStock, toggleActive, updatePrice } = useMenus(tenantId ?? undefined)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')

  const filtered = menus.filter(m => {
    const matchQ = m.name.toLowerCase().includes(q.toLowerCase()) || m.niche.includes(q.toLowerCase())
    const matchF = filter==='all' || m.niche===filter
    return matchQ && matchF
  })

  const activeCount = menus.filter(m=>m.is_active).length

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap gap-2">
        <button onClick={()=>setFilter('all')} className={`px-3 py-1.5 rounded-full text-[12px] ${filter==='all'?'bg-slate-900 text-white':'bg-white border'}`}>Semua ({menus.length})</button>
        {['bakery','padel','salon','resto'].map(n=>(
          <button key={n} onClick={()=>setFilter(n)} className={`px-3 py-1.5 rounded-full text-[12px] capitalize ${filter===n?'bg-slate-900 text-white':'bg-white border'}`}>{n}</button>
        ))}
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Menu Aktif (listing)</div><div className="text-[20px] font-bold">{activeCount} / {menus.length}</div><div className="text-[11px] text-slate-500">Stok 0 auto hide, toggle manual tidak ubah stok</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Total Stok Fisik</div><div className="text-[20px] font-bold">{menus.reduce((s,m)=>s+m.stock,0)} item</div><div className="text-[11px] text-emerald-600">Supabase-backed + cache tenant</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Bug Fix V3</div><div className="text-[13px] font-semibold mt-1">Stock ≠ Active (fixed)</div><div className="text-[11px] text-slate-500">Stock 0 → auto inactive. Toggle manual → stock tetap.</div></div>
        <div className="bg-[#25D366]/10 border border-[#25D366]/20 rounded-2xl p-4"><div className="text-[11px] font-bold text-[#128C7E]">Real Persistence</div><div className="text-[11px] mt-1">Data tersimpan di Supabase dan tersinkron lintas device melalui tenant_id.</div></div>
      </div>

      <div className="bg-white rounded-[20px] border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex flex-wrap justify-between gap-3">
          <h2 className="font-bold text-[15px]">Menu & Stok - Fixed Logic V3</h2>
          <div className="flex gap-2 items-center">
            <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari..." className="h-9 rounded-xl border pl-8 pr-3 text-[13px] w-[180px]" /></div>
          </div>
        </div>
        <div className="divide-y">
          {filtered.map(m=>(
            <div key={m.id} className="p-4 flex flex-wrap gap-4 items-center hover:bg-slate-50/60">
              <div className="w-12 h-12 rounded-xl bg-slate-100 grid place-items-center text-[20px]">{m.emoji}</div>
              <div className="flex-1 min-w-[220px]">
                <div className="flex gap-2 items-center flex-wrap"><span className="font-semibold text-[13px]">{m.name}</span><span className="text-[10px] px-2 py-0.5 rounded-full border bg-slate-50">{m.niche}</span><span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100">Stock: {m.stock}</span></div>
                <div className="text-[11px] text-slate-500">{m.description} • Updated {new Date(m.updated_at).toLocaleTimeString('id-ID')}</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-slate-50 border rounded-xl px-2 h-9">
                  <button onClick={()=>addStock(m.id,-1)} className="w-6 h-6 rounded-lg bg-white border font-bold">-</button>
                  <span className="text-[12px] font-semibold w-[32px] text-center">{m.stock}</span>
                  <button onClick={()=>addStock(m.id,1)} className="w-6 h-6 rounded-lg bg-white border font-bold">+</button>
                </div>
                <button onClick={()=>toggleActive(m.id)} className={`h-9 px-3 rounded-xl text-[11px] font-bold border ${m.is_active?'bg-emerald-50 text-emerald-700 border-emerald-200':'bg-red-50 text-red-700 border-red-200'}`}>{m.is_active?'🟢 Listing Aktif':'🔴 Listing Hide (stock tetap '+m.stock+')'}</button>
                <button onClick={()=>{const p=prompt(`Harga baru untuk ${m.name}`, String(m.price)); if(p) updatePrice(m.id, parseInt(p))}} className="h-9 px-3 rounded-xl bg-white border text-[12px] font-semibold">Rp{m.price.toLocaleString('id-ID')}</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
