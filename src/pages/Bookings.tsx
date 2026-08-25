
import { useState } from 'react'
import { useTenantAuth } from '../context/TenantAuthContext'
import { useParams } from 'react-router-dom'
import { useBookings } from '../hooks/useBookings'

export function Bookings() {
  const { slug } = useParams()
  const { tenantId } = useTenantAuth()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const { slots, bookSlot, cancelSlot } = useBookings(tenantId || '', date)
  const [customerName, setCustomerName] = useState('')
  const [customerWa, setCustomerWa] = useState('')
  if (!tenantId) return null

  const fields = Array.from(new Set(slots.map(s=>s.field)))
  const hours = Array.from(new Set(slots.map(s=>`${s.start}-${s.end}`))).sort()

  const getSlot = (field: string, hour: string) => {
    const [start] = hour.split('-')
    return slots.find(s=>s.field===field && s.start===start)
  }

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <h2 className="font-bold text-[18px]">Booking Engine - {slug} • Real slot engine + Supabase Realtime</h2>
        <div className="flex gap-2 items-center">
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} className="h-9 rounded-xl border px-3 text-[13px]" />
          <span className="text-[11px] px-2 py-1 rounded-full bg-[#25D366] text-white font-bold">Multi-tenant /t/{slug}</span>
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-4 flex flex-wrap gap-2">
        <input value={customerName} onChange={e=>setCustomerName(e.target.value)} placeholder="Nama customer" className="h-9 rounded-xl border px-3 text-[13px]" />
        <input value={customerWa} onChange={e=>setCustomerWa(e.target.value)} placeholder="WA" className="h-9 rounded-xl border px-3 text-[13px]" />
        <span className="text-[11px] py-2">Pilih slot hijau untuk booking, merah untuk cancel. Realtime sync.</span>
      </div>

      <div className="bg-white rounded-[20px] border shadow-sm overflow-hidden">
        <div className="p-4 border-b font-bold text-[13px]">Grid Lapangan vs Jam - {date}</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="bg-slate-50">
              <tr><th className="p-2 text-left">Jam</th>{fields.map(f=><th key={f} className="p-2">{f}</th>)}</tr>
            </thead>
            <tbody>
              {hours.map(h=>{
                return (
                  <tr key={h} className="border-t">
                    <td className="p-2 font-mono text-[11px]">{h}</td>
                    {fields.map(field=>{
                      const slot = getSlot(field, h)
                      if (!slot) return <td key={field} className="p-2 text-center">-</td>
                      return (
                        <td key={field} className="p-1">
                          <button
                            disabled={slot.status==='available' && (!customerName.trim() || !customerWa.trim())}
                            title={slot.status==='available' && (!customerName.trim() || !customerWa.trim()) ? 'Isi nama dan WA customer dulu' : undefined}
                            onClick={()=> slot.status==='available' ? bookSlot(slot.id, customerName, customerWa) : cancelSlot(slot.id)}
                            className={`w-full h-12 rounded-xl text-[10px] font-semibold border disabled:opacity-40 disabled:cursor-not-allowed ${slot.status==='available' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}>
                            <div>{slot.status==='available' ? 'Available' : slot.customer_name}</div>
                            <div className="font-mono">Rp{slot.price.toLocaleString('id-ID')}</div>
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-900 text-white rounded-2xl p-3 text-[11px]">🏸 Slot yang berwarna hijau tersedia, merah berarti sudah dibooking. Perubahan tersinkron real-time lewat Supabase kalau env sudah diisi.</div>
    </div>
  )
}
