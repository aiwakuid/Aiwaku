import { useMemo, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowUpRight, CalendarPlus, ChevronRight, AlertCircle, PackageCheck, Plus, ShoppingCart, Sparkles, UsersRound } from 'lucide-react'
import { useMenus } from '../hooks/useMenus'
import { useOrders } from '../hooks/useOrders'
import { useTenantAuth } from '../context/TenantAuthContext'
import { format, isSameDay, subDays } from 'date-fns'
import { id as idLocale } from 'date-fns/locale'

const money = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n)

export function Dashboard() {
  const { slug } = useParams()
  const { tenantId } = useTenantAuth()
  const { menus } = useMenus(tenantId ?? undefined)
  const { orders } = useOrders(tenantId ?? undefined)
  const now = new Date()
  const todayOrders = useMemo(() => orders.filter(o => isSameDay(new Date(o.created_at), now) && o.status !== 'batal'), [orders])
  const revenue = todayOrders.reduce((sum, o) => sum + o.total, 0)
  const yesterday = orders.filter(o => isSameDay(new Date(o.created_at), subDays(now, 1)) && o.status !== 'batal').reduce((sum, o) => sum + o.total, 0)
  const delta = yesterday ? Math.round(((revenue - yesterday) / yesterday) * 100) : 0
  const lowStock = menus.filter(m => m.is_active && m.stock > 0 && m.stock <= 5)
  const soldOut = menus.filter(m => m.is_active && m.stock <= 0)
  const customers = new Set(todayOrders.map(o => o.customer_wa || o.customer_name).filter(Boolean)).size
  const base = slug ? `/t/${slug}` : ''

  return (
    <div className="max-w-[1440px] mx-auto p-4 md:p-7 space-y-6">
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">{format(now, 'EEEE, dd MMMM yyyy', { locale: idLocale })}</p>
          <h1 className="mt-1 text-2xl md:text-3xl font-extrabold tracking-tight text-slate-950">Selamat datang 👋</h1>
          <p className="mt-1 text-sm text-slate-500">Semua yang penting, kami ringkas untuk Anda.</p>
        </div>
        <div className="flex gap-2">
          <Link to={`${base}/bookings`} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-white border border-slate-200 text-xs font-bold hover:border-slate-300"><CalendarPlus size={15}/> Booking</Link>
          <Link to={`${base}/invoices`} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-slate-950 text-white text-xs font-bold shadow-sm hover:bg-slate-800"><Plus size={15}/> Jual sekarang</Link>
        </div>
      </section>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl bg-slate-950 text-white p-5 shadow-sm">
          <div className="text-[11px] text-white/60">Penjualan hari ini</div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight">{money(revenue)}</div>
          <div className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-300"><ArrowUpRight size={14}/> {delta >= 0 ? '+' : ''}{delta}% vs kemarin</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5">
          <div className="flex justify-between"><div className="text-[11px] text-slate-500">Transaksi</div><ShoppingCart size={16} className="text-slate-400"/></div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight">{todayOrders.length}</div>
          <div className="mt-2 text-[11px] text-slate-400">{customers} pelanggan hari ini</div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5">
          <div className="flex justify-between"><div className="text-[11px] text-slate-500">Menu aktif</div><PackageCheck size={16} className="text-slate-400"/></div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight">{menus.filter(m => m.is_active).length}</div>
          <div className="mt-2 text-[11px] text-slate-400">{lowStock.length} stok rendah • {soldOut.length} habis</div>
        </div>
      </section>

      <section className="grid lg:grid-cols-[1.45fr_.85fr] gap-4">
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5">
          <div className="flex items-start justify-between gap-4">
            <div><div className="flex items-center gap-2 text-sm font-extrabold"><Sparkles size={16} className="text-violet-500"/> AIWAKU menemukan</div><p className="text-xs text-slate-500 mt-1">Tiga hal yang layak Anda perhatikan hari ini.</p></div>
            <Link to={`${base}/admin`} className="text-[11px] font-bold text-slate-500 hover:text-slate-900">Lihat AI <ChevronRight size={13} className="inline"/></Link>
          </div>
          <div className="mt-5 space-y-3">
            <Insight icon={<ArrowUpRight size={16}/>} tone="green" title="Penjualan berjalan baik" text={`${todayOrders.length} transaksi tercatat hari ini${revenue ? ` dengan total ${money(revenue)}` : ''}.`} />
            <Insight icon={<AlertCircle size={16}/>} tone={lowStock.length ? 'amber' : 'green'} title={lowStock.length ? 'Stok perlu perhatian' : 'Stok aman'} text={lowStock.length ? `${lowStock.length} menu tinggal 5 porsi atau kurang.` : 'Tidak ada menu aktif dengan stok kritis.'} action={lowStock.length ? 'Atur stok' : undefined} />
            <Insight icon={<UsersRound size={16}/>} tone="blue" title="Pelanggan tetap terpantau" text={customers ? `${customers} pelanggan bertransaksi hari ini.` : 'Belum ada transaksi pelanggan hari ini.'} />
          </div>
        </div>
        <div className="rounded-2xl bg-white border border-slate-200/80 p-5">
          <div className="text-sm font-extrabold">Aksi cepat</div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <QuickLink to={`${base}/invoices`} icon={<ShoppingCart size={16}/>} label="Jualan" />
            <QuickLink to={`${base}/menu`} icon={<PackageCheck size={16}/>} label="Kelola stok" />
            <QuickLink to={`${base}/customers`} icon={<UsersRound size={16}/>} label="Pelanggan" />
            <QuickLink to={`${base}/reports`} icon={<ArrowUpRight size={16}/>} label="Lihat bisnis" />
          </div>
          <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 p-3 text-[11px] text-slate-500 leading-5">💡 <b className="text-slate-700">Tip:</b> Tidak perlu membuka semua menu. Mulai dari aksi utama, AIWAKU akan membantu sisanya.</div>
        </div>
      </section>

      <section className="rounded-2xl bg-gradient-to-br from-violet-50 to-white border border-violet-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div><div className="flex items-center gap-2 text-sm font-extrabold text-slate-900"><Sparkles size={16} className="text-violet-500"/> Butuh bantuan?</div><p className="mt-1 text-xs text-slate-500">Tanyakan apa saja: penjualan, stok, pelanggan, atau minta AIWAKU mengerjakan sesuatu.</p></div>
        <Link to={`${base}/admin`} className="shrink-0 inline-flex items-center justify-center h-10 px-4 rounded-xl bg-white border border-violet-200 text-xs font-bold text-slate-900 hover:border-violet-300">Tanya AIWAKU <ChevronRight size={14}/></Link>
      </section>
    </div>
  )
}

function Insight({ icon, tone, title, text, action }: { icon: ReactNode, tone: 'green'|'amber'|'blue', title: string, text: string, action?: string }) {
  const tones = { green: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', blue: 'bg-blue-50 text-blue-600' }
  return <div className="flex items-start gap-3 rounded-xl border border-slate-100 p-3.5"><div className={`w-8 h-8 rounded-lg grid place-items-center shrink-0 ${tones[tone]}`}>{icon}</div><div className="min-w-0 flex-1"><div className="text-xs font-bold text-slate-800">{title}</div><div className="text-[11px] text-slate-500 mt-0.5 leading-5">{text}</div></div>{action && <Link to="../menu" className="text-[10px] font-bold text-slate-700 whitespace-nowrap">{action}</Link>}</div>
}

function QuickLink({ to, icon, label }: { to: string, icon: ReactNode, label: string }) {
  return <Link to={to} className="rounded-xl border border-slate-200 p-3 hover:bg-slate-50 transition-colors"><div className="w-8 h-8 rounded-lg bg-slate-100 grid place-items-center text-slate-700">{icon}</div><div className="mt-2 text-[11px] font-bold text-slate-700">{label}</div></Link>
}
