
import { useState } from 'react'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useParams } from 'react-router-dom'
import { useCustomers } from '../hooks/useCustomers'
import { Search, Star } from 'lucide-react'

export function Customers() {
  const { slug } = useParams()
  const { tenantId } = useTenantAuth()
  const { customers, addCustomer } = useCustomers(tenantId || '')
  const [q, setQ] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newWa, setNewWa] = useState('')
  if (!tenantId) return null

  const filtered = customers.filter(c=> c.name.toLowerCase().includes(q.toLowerCase()) || c.wa.includes(q))

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="font-bold text-[18px]">Customer DB - {slug} • Real persistence + Realtime</h2>
        <button onClick={()=>setShowAdd(!showAdd)} className="h-9 px-4 rounded-xl bg-slate-900 text-white text-[12px] font-semibold">+ Tambah Customer</button>
      </div>

      {showAdd && (
        <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-2">
          <input value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Nama" className="h-9 rounded-xl border px-3 text-[13px]" />
          <input value={newWa} onChange={e=>setNewWa(e.target.value)} placeholder="WA 08xx" className="h-9 rounded-xl border px-3 text-[13px]" />
          <button onClick={()=>{ if(newName && newWa){ addCustomer({tenant_id: tenantId, name: newName, wa: newWa, tags: ['Baru']}); setNewName(''); setNewWa(''); setShowAdd(false) } }} className="h-9 px-4 rounded-xl bg-[#25D366] text-white text-[12px]">Simpan</button>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Total Customer</div><div className="text-[20px] font-bold">{customers.length}</div><div className="text-[11px] text-emerald-600">Auto sync Supabase Realtime jika env diisi</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">VIP</div><div className="text-[20px] font-bold">{customers.filter(c=>c.tags.includes('VIP')).length}</div><div className="text-[11px]">Top spender: {[...customers].sort((a,b)=>b.total_spent-a.total_spent)[0]?.name || '-'}</div></div>
        <div className="bg-white rounded-2xl border p-4"><div className="text-[11px] text-slate-500">Total Revenue dari Customer DB</div><div className="text-[20px] font-bold">Rp{customers.reduce((s,c)=>s+c.total_spent,0).toLocaleString('id-ID')}</div><div className="text-[11px]">Avg {customers.length? (customers.reduce((s,c)=>s+c.total_spent,0)/customers.length).toLocaleString('id-ID') : 0} / customer</div></div>
      </div>

      <div className="bg-white rounded-[20px] border shadow-sm overflow-hidden">
        <div className="p-4 border-b flex justify-between">
          <div className="relative"><Search size={14} className="absolute left-2.5 top-2.5 text-slate-400"/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Cari nama / WA" className="h-9 rounded-xl border pl-8 pr-3 text-[13px] w-[200px]" /></div>
          <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 border">Multi-tenant: /t/{slug}</span>
        </div>
        <div className="divide-y">
          {filtered.map(c=>(
            <div key={c.id} className="p-4 flex flex-wrap gap-4 items-center">
              <div className="w-10 h-10 rounded-full bg-slate-900 text-white grid place-items-center font-bold text-[12px]">{c.name[0]}</div>
              <div className="flex-1 min-w-[200px]"><div className="flex gap-2 items-center"><span className="font-semibold text-[13px]">{c.name}</span>{c.tags.includes('VIP')&&<Star size={12} className="text-amber-500 fill-amber-500"/>}<span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-50 border">{c.wa}</span></div><div className="text-[11px] text-slate-500">{c.total_orders} order • Rp{c.total_spent.toLocaleString('id-ID')} • Last: {c.last_order_at ? new Date(c.last_order_at).toLocaleDateString('id-ID') : '-'}</div></div>
              <div className="flex gap-1">{c.tags.map(t=><span key={t} className="text-[10px] px-2 py-1 rounded-full bg-amber-50 border border-amber-200">{t}</span>)}</div>
              <button onClick={()=>window.open(`https://wa.me/${c.wa.replace(/[^0-9]/g,'')}?text=Halo%20${c.name},%20dari%20${slug}`,'_blank')} className="h-8 px-3 rounded-xl bg-[#25D366] text-white text-[11px]">WA</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
