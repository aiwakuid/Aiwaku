
import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useMenus } from '../hooks/useMenus'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useTenant } from '../hooks/useTenant'
import { Search, Store } from 'lucide-react'

export function Catalog() {
  const { slug } = useParams()
  const { tenantId } = useTenantAuth()
  const { menus } = useMenus(tenantId ?? undefined)
  // membership.tenant hanya berisi {id,slug,name} (lihat TenantAuthContext),
  // tidak ada wa_number - sebelumnya di-merge dengan defaultTenant sehingga
  // wa_number SELALU jatuh ke nomor demo "62812xxxx". useTenant() fetch baris
  // tenant lengkap (termasuk wa_number asli) langsung dari Supabase.
  const { tenant } = useTenant()
  const [q, setQ] = useState('')

  // Katalog publik: hanya tampilkan menu is_active (stok tersedia), bukan semua menu internal
  const activeMenus = menus.filter(m => m.is_active)
  const niches = Array.from(new Set(activeMenus.map(m => m.niche)))
  const [filter, setFilter] = useState('all')

  const filtered = activeMenus.filter(m => {
    const matchQ = m.name.toLowerCase().includes(q.toLowerCase())
    const matchF = filter === 'all' || m.niche === filter
    return matchQ && matchF
  })

  const orderViaWA = (menuName: string, price: number) => {
    const waNumber = (tenant.wa_number || '').replace(/[^0-9]/g, '')
    const text = `Halo ${tenant.name}, saya mau pesan "${menuName}" (Rp${price.toLocaleString('id-ID')}) dari katalog online.`
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, '_blank')
  }

  return (
    <div className="p-4 md:p-6 max-w-[1200px] mx-auto space-y-4">
      <div className="bg-[#0F172A] text-white rounded-[20px] p-6 flex items-center gap-3">
        <Store size={28} />
        <div>
          <div className="font-bold text-[18px]">{tenant.name}</div>
          <div className="text-[12px] opacity-70">Katalog Online • app.aiwaku.id/t/{slug}/catalog</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center justify-between">
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setFilter('all')} className={`px-3 py-1.5 rounded-full text-[12px] ${filter === 'all' ? 'bg-slate-900 text-white' : 'bg-white border'}`}>Semua ({activeMenus.length})</button>
          {niches.map(n => (
            <button key={n} onClick={() => setFilter(n)} className={`px-3 py-1.5 rounded-full text-[12px] capitalize ${filter === n ? 'bg-slate-900 text-white' : 'bg-white border'}`}>{n}</button>
          ))}
        </div>
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari produk..." className="h-9 rounded-xl border pl-8 pr-3 text-[13px] w-[200px]" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border p-8 text-center text-[13px] text-slate-500">
          {activeMenus.length === 0 ? 'Belum ada produk aktif. Aktifkan menu di halaman Menu & Stok.' : 'Tidak ada produk yang cocok dengan pencarian.'}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
          {filtered.map(m => (
            <div key={m.id} className="bg-white rounded-2xl border overflow-hidden hover:shadow-md transition">
              <div className="h-[100px] bg-slate-100 grid place-items-center text-[36px]">{m.emoji}</div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-[13px]">{m.name}</span>
                  <span className="text-[9px] px-2 py-0.5 rounded-full border bg-slate-50 capitalize shrink-0">{m.niche}</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-1 line-clamp-2">{m.description}</div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="font-bold text-[14px]">Rp{m.price.toLocaleString('id-ID')}</span>
                  <span className="text-[10px] text-slate-400">Stok {m.stock}</span>
                </div>
                <button onClick={() => orderViaWA(m.name, m.price)} className="mt-3 w-full h-9 rounded-xl bg-[#25D366] text-white text-[12px] font-semibold">Pesan via WA</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="bg-slate-900 text-white rounded-2xl p-3 text-[11px]">🛍️ Katalog ini otomatis mengikuti data Menu &amp; Stok - hanya produk dengan status aktif (stok &gt; 0 atau di-hide manual) yang tampil di sini. Tombol "Pesan via WA" langsung buka chat WA ke nomor toko.</div>
    </div>
  )
}
