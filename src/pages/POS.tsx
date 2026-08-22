import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Minus, Plus, Search, ShoppingBag, Trash2, X, Zap } from 'lucide-react'
import { useMenus } from '../hooks/useMenus'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useTenant } from '../hooks/useTenant'
import { createOrderServer } from '../lib/ordersApi'
import { createQRISPayment, getPayment, recordCashPayment } from '../lib/payment'

type CartLine = { menuId: string; quantity: number }

type OrderMode = 'dine-in' | 'takeaway' | 'delivery'

const money = (n: number) => `Rp${n.toLocaleString('id-ID')}`

// FASE 2 #12: persist QRIS in-flight state supaya tidak hilang saat halaman
// ter-refresh (misalnya kasir tanpa sengaja reload sambil pelanggan masih scan QR).
// Key per-tenant supaya QRIS in-progress dari tenant lain di device yang sama
// tidak ketimpa/kebocor.
type QrisState = { paymentId: string; paymentUrl?: string; invoiceNo?: string; amount: number }
const qrisStorageKey = (tenantId: string) => `aiwaku:pos:qris:${tenantId}`

export function POS() {
  const { tenantId: authTenantId } = useTenantAuth()
  const { tenant } = useTenant()
  const tenantId = authTenantId || tenant.id
  const { menus } = useMenus(tenantId)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('all')
  const [cart, setCart] = useState<CartLine[]>([])
  const [mode, setMode] = useState<OrderMode>('dine-in')
  const [table, setTable] = useState('T01')
  const tables = Array.from({ length: 12 }, (_, i) => `T${String(i + 1).padStart(2, '0')}`)
  const [customerName, setCustomerName] = useState('')
  const [customerWa, setCustomerWa] = useState('')
  const [payment, setPayment] = useState<'cash' | 'qris'>('cash')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [qris, setQris] = useState<QrisState | null>(null)
  const [qrisStatus, setQrisStatus] = useState<'pending'|'paid'|'expired'|'failed'>('pending')
  // Dibuat sekali per percobaan transaksi, dipakai ulang kalau submit()
  // di-retry (network gagal) supaya tidak membuat order duplikat.
  // Direset ke null setelah order berhasil dibuat.
  const idempotencyKeyRef = useRef<string | null>(null)

  // Recovery: kalau ada QRIS pending yang tersimpan dari sebelum refresh, muat lagi.
  // Status TIDAK dipercaya dari storage — selalu dipaksa 'pending' supaya polling
  // getPayment() di bawah yang menentukan status sebenarnya.
  useEffect(() => {
    if (!tenantId) return
    try {
      const raw = sessionStorage.getItem(qrisStorageKey(tenantId))
      if (!raw) return
      const saved = JSON.parse(raw) as QrisState
      if (saved?.paymentId) {
        setQris(saved)
        setQrisStatus('pending')
      }
    } catch { /* storage rusak/tidak tersedia, abaikan */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId])

  useEffect(() => {
    if (!tenantId) return
    try {
      if (qris) sessionStorage.setItem(qrisStorageKey(tenantId), JSON.stringify(qris))
      else sessionStorage.removeItem(qrisStorageKey(tenantId))
    } catch { /* storage rusak/tidak tersedia (mis. private mode), abaikan */ }
  }, [qris, tenantId])

  const categories = useMemo(() => ['all', ...Array.from(new Set(menus.map(m => m.niche)))], [menus])
  const visibleMenus = useMemo(() => menus.filter(m => {
    const text = `${m.name} ${m.description}`.toLowerCase()
    return m.is_active && m.stock > 0 && text.includes(query.toLowerCase()) && (category === 'all' || m.niche === category)
  }), [menus, query, category])

  const cartDetails = cart.map(line => {
    const menu = menus.find(m => m.id === line.menuId)
    return menu ? { ...line, menu, subtotal: menu.price * line.quantity } : null
  }).filter(Boolean) as Array<CartLine & { menu: typeof menus[number]; subtotal: number }>

  const total = cartDetails.reduce((sum, line) => sum + line.subtotal, 0)
  useEffect(() => {
    if (!qris || qrisStatus !== 'pending') return
    let cancelled = false
    const check = async () => {
      try {
        const paymentRow = await getPayment(qris.paymentId)
        if (!cancelled && paymentRow?.status && paymentRow.status !== 'pending') {
          setQrisStatus(paymentRow.status as 'paid'|'expired'|'failed')
          if (paymentRow.status === 'paid') setMessage(`Pembayaran ${qris.invoiceNo || ''} sudah diterima. Pesanan lunas.`)
        }
      } catch { /* status polling should never block the POS */ }
    }
    check()
    const timer = window.setInterval(check, 3000)
    return () => { cancelled = true; window.clearInterval(timer) }
  }, [qris, qrisStatus])


  function add(menuId: string) {
    setMessage(null)
    idempotencyKeyRef.current = null // cart berubah = transaksi baru, bukan retry
    setCart(prev => {
      const found = prev.find(x => x.menuId === menuId)
      if (found) return prev.map(x => x.menuId === menuId ? { ...x, quantity: x.quantity + 1 } : x)
      return [...prev, { menuId, quantity: 1 }]
    })
  }

  function change(menuId: string, delta: number) {
    idempotencyKeyRef.current = null // cart berubah = transaksi baru, bukan retry
    setCart(prev => prev.flatMap(x => x.menuId !== menuId ? [x] : x.quantity + delta <= 0 ? [] : [{ ...x, quantity: x.quantity + delta }]))
  }

  async function submit() {
    if (!cart.length || busy) return
    setBusy(true)
    setMessage(null)
    if (!idempotencyKeyRef.current) idempotencyKeyRef.current = crypto.randomUUID()
    try {
      const order = await createOrderServer({
        tenantId,
        customerName: customerName || 'Walk-in',
        customerWa,
        items: cart,
        discount: 0,
        tax: 0,
        customText: JSON.stringify({ mode, table: mode === 'dine-in' ? table : null }),
        idempotencyKey: idempotencyKeyRef.current,
      })
      // Order berhasil dibuat (atau sudah ada dari attempt sebelumnya berkat
      // idempotency key) — reset key untuk transaksi berikutnya.
      idempotencyKeyRef.current = null
      if (payment === 'cash') {
        await recordCashPayment(order.id, total)
        setMessage(`Pesanan ${order?.invoice_no || 'berhasil'} selesai. Pembayaran tunai sudah lunas.`)
      } else {
        const pay = await createQRISPayment(order.id, total, customerName || 'Walk-in', tenantId, order.invoice_no)
        setQris({ paymentId: pay.paymentId, paymentUrl: pay.paymentUrl, invoiceNo: order.invoice_no, amount: total })
        setQrisStatus('pending')
        setMessage(`Pesanan ${order?.invoice_no || 'berhasil'} dibuat. Selesaikan pembayaran QRIS.`)
      }
      setCart([])
      setCustomerName('')
      setCustomerWa('')
    } catch (error) {
      // idempotencyKeyRef TIDAK direset di sini — kalau user klik "Bayar"
      // lagi setelah error (mis. timeout), kita pakai key yang sama supaya
      // create-order tidak membuat order kedua untuk transaksi yang sama.
      setMessage(error instanceof Error ? error.message : 'Pesanan belum berhasil dibuat. Coba lagi.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-3 md:p-5 max-w-[1500px] mx-auto h-[calc(100vh-56px)] flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-slate-500">Jualan</div>
          <h1 className="text-xl md:text-2xl font-bold tracking-tight">Kasir yang cepat, tanpa ribet.</h1>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-3 py-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Siap menerima pesanan</div>
      </div>

      <div className="grid grid-cols-3 bg-white border rounded-2xl p-1 max-w-xl">
        {([['dine-in', 'Dine-in'], ['takeaway', 'Bawa pulang'], ['delivery', 'Delivery']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setMode(key)} className={`h-9 rounded-xl text-[12px] font-semibold ${mode === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>

      {mode === 'dine-in' && (
        <div className="bg-white border rounded-2xl p-2 flex gap-2 overflow-x-auto">
          <div className="shrink-0 px-2 py-2 text-[11px] font-bold text-slate-500">Meja</div>
          {tables.map(t => <button key={t} onClick={() => setTable(t)} className={`shrink-0 min-w-14 h-9 rounded-xl border text-[11px] font-bold ${table === t ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{t}</button>)}
        </div>
      )}

      <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_380px] gap-3">
        <section className="min-h-0 bg-white border rounded-3xl overflow-hidden flex flex-col">
          <div className="p-3 border-b space-y-3">
            <div className="relative"><Search size={16} className="absolute left-3 top-3 text-slate-400" /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari menu..." className="w-full h-10 rounded-xl bg-slate-50 border border-slate-200 pl-9 pr-3 text-[13px] outline-none focus:ring-2 focus:ring-slate-200" autoFocus /></div>
            <div className="flex gap-2 overflow-x-auto pb-0.5">
              {categories.map(item => <button key={item} onClick={() => setCategory(item)} className={`shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold capitalize border ${category === item ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600'}`}>{item === 'all' ? 'Semua' : item}</button>)}
            </div>
          </div>
          <div className="p-3 overflow-y-auto grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {visibleMenus.map(menu => <button key={menu.id} onClick={() => add(menu.id)} className="text-left rounded-2xl border bg-white hover:border-slate-400 hover:shadow-sm transition p-3 group">
              <div className="h-24 rounded-xl bg-slate-100 grid place-items-center text-4xl group-hover:scale-[1.02] transition">{menu.emoji}</div>
              <div className="mt-2 font-semibold text-[13px] leading-4">{menu.name}</div>
              <div className="mt-1 flex items-center justify-between gap-2"><span className="text-[13px] font-bold">{money(menu.price)}</span><span className="text-[10px] text-slate-400">{menu.stock} tersedia</span></div>
            </button>)}
            {!visibleMenus.length && <div className="col-span-full py-16 text-center text-slate-400 text-[13px]">Menu tidak ditemukan.</div>}
          </div>
        </section>

        <aside className="bg-white border rounded-3xl overflow-hidden flex flex-col min-h-0">
          <div className="p-4 border-b flex items-center justify-between"><div><div className="font-bold">Pesanan baru</div><div className="text-[10px] text-slate-400">{cartDetails.length} jenis menu</div></div><ShoppingBag size={19} /></div>
          <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
            {!cartDetails.length && <div className="h-full min-h-48 grid place-items-center text-center text-slate-400"><div><div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 grid place-items-center mb-2"><ShoppingBag size={21} /></div><div className="text-[13px] font-semibold text-slate-600">Keranjang masih kosong</div><div className="text-[11px] mt-1">Pilih menu untuk mulai.</div></div></div>}
            {cartDetails.map(line => <div key={line.menuId} className="rounded-2xl border p-3 flex gap-3"><div className="w-10 h-10 rounded-xl bg-slate-100 grid place-items-center text-xl">{line.menu.emoji}</div><div className="min-w-0 flex-1"><div className="text-[12px] font-semibold truncate">{line.menu.name}</div><div className="text-[11px] text-slate-500 mt-0.5">{money(line.menu.price)}</div><div className="flex items-center gap-1 mt-2"><button onClick={() => change(line.menuId, -1)} className="w-7 h-7 rounded-lg border grid place-items-center"><Minus size={13} /></button><span className="w-7 text-center text-[12px] font-bold">{line.quantity}</span><button onClick={() => change(line.menuId, 1)} className="w-7 h-7 rounded-lg border grid place-items-center"><Plus size={13} /></button></div></div><div className="text-[12px] font-bold">{money(line.subtotal)}</div><button onClick={() => setCart(prev => prev.filter(x => x.menuId !== line.menuId))} className="text-slate-300 hover:text-red-500"><Trash2 size={14} /></button></div>)}
          </div>

          <div className="border-t p-3 space-y-3">
            <div className="grid grid-cols-2 gap-2"><input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Nama pelanggan" className="h-9 rounded-xl border px-3 text-[11px]" /><input value={customerWa} onChange={e => setCustomerWa(e.target.value)} placeholder="WhatsApp (opsional)" className="h-9 rounded-xl border px-3 text-[11px]" /></div>
            <div className="grid grid-cols-2 gap-2"><button onClick={() => setPayment('cash')} className={`h-9 rounded-xl border text-[11px] font-semibold ${payment === 'cash' ? 'bg-slate-900 text-white' : ''}`}>Tunai</button><button onClick={() => setPayment('qris')} className={`h-9 rounded-xl border text-[11px] font-semibold ${payment === 'qris' ? 'bg-slate-900 text-white' : ''}`}>QRIS</button></div>
            <div className="flex justify-between items-end"><span className="text-[12px] text-slate-500">Total</span><span className="text-2xl font-black tracking-tight">{money(total)}</span></div>
            {message && <div className={`rounded-xl p-2.5 text-[11px] ${message.includes('tercatat') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{message}</div>}
            <button disabled={!cart.length || busy} onClick={submit} className="w-full h-12 rounded-2xl bg-slate-900 text-white text-[13px] font-bold flex items-center justify-center gap-2 disabled:opacity-40">{busy ? <Zap size={16} className="animate-pulse" /> : <Check size={17} />}{busy ? 'Memproses...' : `Selesaikan ${money(total)}`}</button>
            {cart.length > 0 && <button onClick={() => setCart([])} className="w-full h-8 text-[11px] text-slate-400 flex items-center justify-center gap-1"><X size={13} /> Kosongkan pesanan</button>}
          </div>
        </aside>
      </div>

      {qris && (
        <div className="fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-5">
            <div className="flex items-start justify-between gap-4">
              <div><div className="text-[11px] text-slate-500">Pembayaran QRIS</div><h2 className="text-xl font-black mt-1">Selesaikan pembayaran</h2><div className="text-[12px] text-slate-500 mt-1">{qris.invoiceNo} · {money(qris.amount)}</div></div>
              <button onClick={() => setQris(null)} className="w-9 h-9 rounded-xl border grid place-items-center"><X size={16}/></button>
            </div>
            <div className={`mt-5 rounded-2xl p-4 text-center ${qrisStatus === 'paid' ? 'bg-emerald-50 text-emerald-700' : qrisStatus === 'failed' || qrisStatus === 'expired' ? 'bg-red-50 text-red-700' : 'bg-slate-50 text-slate-700'}`}>
              <div className="text-3xl">{qrisStatus === 'paid' ? '✓' : qrisStatus === 'pending' ? '◌' : '!'}</div>
              <div className="font-bold mt-2">{qrisStatus === 'paid' ? 'Pembayaran diterima' : qrisStatus === 'pending' ? 'Menunggu pembayaran' : qrisStatus === 'expired' ? 'Pembayaran kedaluwarsa' : 'Pembayaran gagal'}</div>
              <div className="text-[11px] mt-1">Status diperbarui otomatis.</div>
            </div>
            {qris.paymentUrl && qrisStatus === 'pending' && <button onClick={() => window.open(qris.paymentUrl, '_blank', 'noopener,noreferrer')} className="w-full h-12 mt-4 rounded-2xl bg-slate-900 text-white font-bold text-[13px]">Buka pembayaran QRIS</button>}
            <button onClick={() => setQris(null)} className="w-full h-10 mt-2 rounded-2xl text-slate-500 text-[12px] font-semibold">Tutup</button>
          </div>
        </div>
      )}
    </div>
  )
}
