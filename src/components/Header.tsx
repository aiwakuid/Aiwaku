import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { format } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'
import type { Tenant } from '../types'

// Halaman-halaman utama untuk kotak "Cari" - sebelumnya kotak ini render
// tapi tidak punya onChange/onSubmit sama sekali (dead UI).
const SEARCHABLE_PAGES = [
  { label: 'Beranda', path: '' },
  { label: 'Jualan (POS)', path: '/pos' },
  { label: 'Menu & Stok', path: '/menu' },
  { label: 'Persediaan', path: '/inventory' },
  { label: 'Kitchen (KDS)', path: '/kds' },
  { label: 'Meja', path: '/tables' },
  { label: 'Booking', path: '/bookings' },
  { label: 'AIWAKU (Admin)', path: '/admin' },
  { label: 'Pelanggan', path: '/customers' },
  { label: 'Bisnis (Laporan)', path: '/reports' },
  { label: 'Kalender', path: '/calendar' },
  { label: 'Katalog', path: '/catalog' },
  { label: 'Invoice & Struk', path: '/invoices' },
  { label: 'Live Chat', path: '/livechat' },
  { label: 'Pengaturan', path: '/settings' },
]

// Placeholder demo dari lib/storage.ts - kalau nomor WA tenant masih ini
// atau kosong, bot WA jelas belum dikonfigurasi beneran.
function isRealWaNumber(wa?: string) {
  if (!wa) return false
  const digits = wa.replace(/[^0-9]/g, '')
  return digits.length >= 8 && !/x/i.test(wa)
}

export function Header({ onToggleMobile, tenant }: { onToggleMobile: () => void, tenant?: Tenant | null }) {
  const now = new Date()
  const navigate = useNavigate()
  const { slug } = useParams()
  const base = slug ? `/t/${slug}` : ''
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return SEARCHABLE_PAGES.filter(p => p.label.toLowerCase().includes(q)).slice(0, 6)
  }, [query])

  const goTo = (path: string) => {
    navigate(`${base}${path}` || '/')
    setQuery('')
    setOpen(false)
  }

  // Bot WA dianggap aktif kalau tenant sudah punya wa_number asli (bukan
  // placeholder demo/kosong). Sebelumnya badge ini selalu "AI aktif" hardcode
  // walau bot belum dikonfigurasi sama sekali.
  const aiActive = isRealWaNumber(tenant?.wa_number)
  const displayName = tenant?.name || 'aiwaku'
  const avatarLetter = (tenant?.owner_name || tenant?.name || 'A').trim().charAt(0).toUpperCase() || 'A'

  return (
    <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-xl border-b border-slate-200/80 h-[64px] flex items-center justify-between px-4 md:px-6">
      <div className="flex items-center gap-3 min-w-0">
        <button onClick={onToggleMobile} aria-label="Buka menu" className="md:hidden p-2 -ml-2 rounded-xl hover:bg-slate-100"><Menu size={19} /></button>
        <div className="flex items-center gap-2.5 min-w-0">
          <img src="/logo.png" alt="AIWAKU" className="h-8 w-8 object-contain rounded-xl" />
          <div className="leading-none min-w-0">
            <div className="font-extrabold tracking-tight text-slate-950 truncate max-w-[180px] sm:max-w-none">{displayName}</div>
            <div className="hidden sm:block text-[9px] text-slate-400 mt-1">{tenant ? 'by aiwaku' : 'AI-native business OS'}</div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="relative hidden md:block">
          <div className="flex items-center gap-2 h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-[11px] text-slate-500 focus-within:bg-white focus-within:border-slate-300">
            <Search size={14} />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setOpen(true) }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 120)}
              onKeyDown={e => { if (e.key === 'Enter' && results[0]) goTo(results[0].path) }}
              placeholder="Cari halaman..."
              aria-label="Cari halaman"
              className="bg-transparent outline-none w-[130px] placeholder:text-slate-400"
            />
          </div>
          {open && results.length > 0 && (
            <div className="absolute right-0 mt-1 w-[220px] rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
              {results.map(r => (
                <button key={r.path} onMouseDown={() => goTo(r.path)} className="w-full text-left px-3 py-2 text-[12px] text-slate-700 hover:bg-slate-50">{r.label}</button>
              ))}
            </div>
          )}
        </div>
        <div className={`hidden sm:flex items-center gap-1.5 rounded-full px-2.5 h-8 text-[10px] font-bold ${aiActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}><span className={`w-1.5 h-1.5 rounded-full ${aiActive ? 'bg-emerald-500' : 'bg-slate-400'}`} /> {aiActive ? 'AI aktif' : 'AI belum diatur'}</div>
        <div className="hidden lg:block text-[10px] text-slate-400 px-2">{format(now, 'dd MMM yyyy', { locale: idLocale })}</div>
        <button className="w-9 h-9 rounded-xl bg-slate-900 text-white grid place-items-center font-bold text-[11px]" aria-label="Profil">{avatarLetter}</button>
      </div>
    </header>
  )
}
