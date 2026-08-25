
import { useState, useMemo, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useTenantAuth } from '../context/TenantAuthContext'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'
import { useOrders } from '../hooks/useOrders'
import { supabase, isSupabaseEnabled } from '../lib/supabase'
import { syncOrderToGoogleCalendar } from '../lib/googleCalendar'
import type { BookingSlot, Order } from '../types'



function toDateKey(d: Date) {
  return d.toISOString().split('T')[0]
}

// Baris booking Supabase pakai nama kolom start_time/end_time/field_no,
// beda dari bentuk BookingSlot di client (start/end/field).
function mapBookingRow(row: any): BookingSlot {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    date: row.date,
    start: row.start_time,
    end: row.end_time,
    field: row.field_no,
    customer_name: row.customer_name ?? '',
    customer_wa: row.customer_wa ?? '',
    status: row.status,
    price: row.price ?? 0,
    created_at: row.created_at,
  }
}

export function Calendar() {
  const { slug } = useParams()
  const { tenantId, membership } = useTenantAuth()
  const [cursor, setCursor] = useState(() => {
    const now = new Date()
    return new Date(now.getFullYear(), now.getMonth(), 1)
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [bookingsByDate, setBookingsByDate] = useState<Record<string, BookingSlot[]>>({})

  const { orders } = useOrders(tenantId ?? undefined)

  // Ambil booking asli sebulan penuh dari Supabase (bukan hanya cache
  // localStorage tanggal yang kebetulan sudah pernah dibuka di halaman Booking).
  useEffect(() => {
    if (!tenantId || !isSupabaseEnabled()) { setBookingsByDate({}); return }
    let cancelled = false
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const start = toDateKey(new Date(year, month, 1))
    const end = toDateKey(new Date(year, month + 1, 0))
    supabase!.from('bookings').select('*').eq('tenant_id', tenantId).eq('status', 'booked')
      .gte('date', start).lte('date', end)
      .then(({ data, error }) => {
        if (cancelled || error || !data) return
        const map: Record<string, BookingSlot[]> = {}
        ;(data as any[]).map(mapBookingRow).forEach(b => {
          if (!map[b.date]) map[b.date] = []
          map[b.date].push(b)
        })
        setBookingsByDate(map)
      })
    return () => { cancelled = true }
  }, [tenantId, cursor])

  if (!tenantId) return null

  const monthLabel = cursor.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })

  const days = useMemo(() => {
    const year = cursor.getFullYear()
    const month = cursor.getMonth()
    const firstDay = new Date(year, month, 1)
    const startOffset = firstDay.getDay() // 0=Minggu
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    const cells: { date: Date | null }[] = []
    for (let i = 0; i < startOffset; i++) cells.push({ date: null })
    for (let d = 1; d <= daysInMonth; d++) cells.push({ date: new Date(year, month, d) })
    return cells
  }, [cursor])

  const ordersByDate = useMemo(() => {
    // pickup_time disimpan sebagai ISO string (lihat invoiceEngine.ts / Invoice.tsx),
    // jadi Date.parse selalu valid untuk order baru. Order lama non-ISO (kalau ada) diabaikan
    // dari grid kalender daripada ditampilkan di tanggal yang salah.
    const map: Record<string, Order[]> = {}
    orders.forEach(o => {
      if (!o.pickup_time || isNaN(Date.parse(o.pickup_time))) return
      const isoKey = toDateKey(new Date(o.pickup_time))
      if (!map[isoKey]) map[isoKey] = []
      map[isoKey].push(o)
    })
    return map
  }, [orders])

  const todayKey = toDateKey(new Date())
  const selectedOrders = selectedDate ? (ordersByDate[selectedDate] || []) : []
  const selectedBookings = selectedDate ? (bookingsByDate[selectedDate] || []) : []

  return (
    <div className="p-4 md:p-6 max-w-[1100px] mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-[18px] flex items-center gap-2"><CalendarDays size={18} /> Calendar - {slug}</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} className="w-9 h-9 rounded-xl border bg-white grid place-items-center"><ChevronLeft size={16} /></button>
          <span className="text-[13px] font-semibold w-[150px] text-center capitalize">{monthLabel}</span>
          <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} className="w-9 h-9 rounded-xl border bg-white grid place-items-center"><ChevronRight size={16} /></button>
        </div>
      </div>

      <div className="bg-white rounded-[20px] border shadow-sm overflow-hidden">
        <div className="grid grid-cols-7 text-[11px] font-bold text-slate-500 border-b">
          {['Min','Sen','Sel','Rab','Kam','Jum','Sab'].map(d => <div key={d} className="p-2 text-center">{d}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {days.map((c, i) => {
            if (!c.date) return <div key={i} className="min-h-[80px] border-b border-r bg-slate-50/50" />
            const key = toDateKey(c.date)
            const dayOrders = ordersByDate[key] || []
            const dayBookings = bookingsByDate[key] || []
            const isToday = key === todayKey
            const isSelected = key === selectedDate
            return (
              <button
                key={i}
                onClick={() => setSelectedDate(key)}
                className={`min-h-[80px] border-b border-r p-2 text-left hover:bg-slate-50 transition ${isSelected ? 'bg-slate-900 text-white hover:bg-slate-900' : ''}`}
              >
                <div className={`text-[12px] font-semibold ${isToday && !isSelected ? 'text-emerald-600' : ''}`}>{c.date.getDate()}</div>
                <div className="mt-1 space-y-0.5">
                  {dayOrders.length > 0 && <div className={`text-[9px] px-1.5 py-0.5 rounded-full inline-block ${isSelected ? 'bg-white/20' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>{dayOrders.length} pickup</div>}
                  {dayBookings.length > 0 && <div className={`text-[9px] px-1.5 py-0.5 rounded-full inline-block ${isSelected ? 'bg-white/20' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>{dayBookings.length} booking</div>}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {selectedDate && (
        <div className="bg-white rounded-2xl border p-4">
          <div className="font-bold text-[14px]">{new Date(selectedDate).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
          {selectedOrders.length === 0 && selectedBookings.length === 0 && (
            <div className="text-[12px] text-slate-500 mt-3">Tidak ada pickup atau booking di tanggal ini.</div>
          )}
          <div className="mt-3 space-y-2">
            {selectedOrders.map(o => (
              <div key={o.id} className="flex flex-wrap justify-between items-center gap-2 p-3 rounded-xl bg-blue-50 border border-blue-200">
                <div>
                  <div className="text-[12px] font-semibold">📦 {o.invoice_no} • {o.customer_name}</div>
                  <div className="text-[11px] text-slate-600">{o.items.map(it=>`${it.name} x${it.qty}`).join(', ')} • Rp{o.total.toLocaleString('id-ID')}</div>
                </div>
                <button onClick={async () => { const r = await syncOrderToGoogleCalendar(o, membership?.tenant?.name || slug || tenantId); if (r?.googleLink) window.open(r.googleLink, '_blank') }} className="text-[11px] px-3 h-8 rounded-xl bg-white border">📅 Buka Calendar</button>
              </div>
            ))}
            {selectedBookings.map(b => (
              <div key={b.id} className="flex flex-wrap justify-between items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div>
                  <div className="text-[12px] font-semibold">🏸 {b.field} • {b.customer_name}</div>
                  <div className="text-[11px] text-slate-600">{b.start}-{b.end} • Rp{b.price.toLocaleString('id-ID')}</div>
                </div>
                <button onClick={() => window.open(`https://wa.me/${b.customer_wa.replace(/[^0-9]/g,'')}`, '_blank')} className="text-[11px] px-3 h-8 rounded-xl bg-white border">WA</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-slate-900 text-white rounded-2xl p-3 text-[11px]">📅 Data diambil real dari order (pickup_time) dan booking Supabase untuk bulan yang sedang dilihat. Klik tanggal untuk lihat detail dan buka link Google Calendar.</div>
    </div>
  )
}
