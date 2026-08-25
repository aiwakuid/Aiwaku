
import { useState, useEffect, useRef } from 'react'
import type { BookingSlot } from '../types'
import { supabase, isSupabaseEnabled, subscribeToTable } from '../lib/supabase'

const STORAGE_KEY = 'aiwaku_v5_bookings'

// Template jam operasional per lapangan. Ini hanya kerangka slot yang
// BISA dipesan (semuanya 'available' sampai ada booking asli) - bukan
// data transaksi. Sebelumnya slot ini di-hash jadi status 'booked' palsu
// (dengan nama customer "Booked" hardcoded) seolah-olah itu data real.
function generateTemplateSlots(date: string, tenantId: string): BookingSlot[] {
  const fields = ['Lapangan 1', 'Lapangan 2', 'Lapangan 3']
  const hours = [
    { start: '07:00', end: '08:00', price: 150000 },
    { start: '08:00', end: '09:00', price: 150000 },
    { start: '09:00', end: '10:00', price: 150000 },
    { start: '10:00', end: '11:00', price: 180000 },
    { start: '18:00', end: '19:00', price: 250000 },
    { start: '19:00', end: '20:00', price: 250000 },
    { start: '20:00', end: '21:00', price: 250000 },
  ]
  const slots: BookingSlot[] = []
  fields.forEach(field => {
    hours.forEach(h => {
      slots.push({
        id: `${date}_${field}_${h.start}`,
        tenant_id: tenantId,
        date,
        start: h.start,
        end: h.end,
        field,
        customer_name: '',
        customer_wa: '',
        status: 'available',
        price: h.price,
        created_at: new Date().toISOString()
      })
    })
  })
  return slots
}

// Baris booking dari Supabase memakai nama kolom tabel (start_time/end_time/
// field_no), berbeda dari bentuk BookingSlot di client (start/end/field).
// Sebelumnya baris mentah ini langsung dipakai sebagai BookingSlot ("as any"),
// jadi field/start/end selalu undefined begitu ada booking asli - merusak
// seluruh grid. Fungsi ini menormalkan nama kolom.
function mapDbRow(row: any): BookingSlot {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    date: row.date,
    start: row.start_time ?? row.start,
    end: row.end_time ?? row.end,
    field: row.field_no ?? row.field,
    customer_id: row.customer_id ?? undefined,
    customer_name: row.customer_name ?? '',
    customer_wa: row.customer_wa ?? '',
    status: row.status,
    order_id: row.order_id ?? undefined,
    price: row.price ?? 0,
    created_at: row.created_at,
  }
}

// Gabungkan booking asli (dari Supabase) ke atas template slot kosong,
// dicocokkan lewat field+start, bukan menimpa seluruh array.
function mergeBookedRows(template: BookingSlot[], bookedRows: BookingSlot[]): BookingSlot[] {
  const byKey = new Map(bookedRows.map(b => [`${b.field}|${b.start}`, b]))
  return template.map(slot => {
    const real = byKey.get(`${slot.field}|${slot.start}`)
    return real && real.status === 'booked' ? { ...slot, ...real, id: real.id } : slot
  })
}

function loadSlots(date: string, tenantId: string): BookingSlot[] {
  const template = generateTemplateSlots(date, tenantId)
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${tenantId}_${date}`)
    if (raw) {
      const parsed = JSON.parse(raw) as BookingSlot[]
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].date === date) {
        const booked = parsed.filter(s => s.status === 'booked')
        return booked.length ? mergeBookedRows(template, booked) : template
      }
    }
  } catch {}
  return template
}

export function useBookings(tenantId: string, date: string) {
  const [slots, setSlots] = useState<BookingSlot[]>(() => loadSlots(date, tenantId))
  // Track tanggal yang sedang dimuat agar efek "save" tidak menimpa storage
  // tanggal baru dengan slot milik tanggal lama (bug korupsi data sebelumnya)
  const loadedDate = useRef(date)

  // FIX: load ulang slot setiap kali tanggal berubah
  useEffect(() => {
    loadedDate.current = date
    setSlots(loadSlots(date, tenantId))
  }, [date, tenantId])

  // Simpan hanya jika state memang milik tanggal yang sedang aktif
  useEffect(() => {
    if (loadedDate.current === date) {
      localStorage.setItem(`${STORAGE_KEY}_${tenantId}_${date}`, JSON.stringify(slots))
    }
  }, [slots, date])

  useEffect(() => {
    if (!isSupabaseEnabled()) return
    let cancelled = false
    supabase!.from('bookings').select('*').eq('tenant_id', tenantId).eq('date', date).eq('status', 'booked')
      .then(({ data }) => {
        if (cancelled || !data) return
        const booked = (data as any[]).map(mapDbRow)
        setSlots(prev => {
          const template = prev.length ? prev : generateTemplateSlots(date, tenantId)
          return mergeBookedRows(template, booked)
        })
      })
    const sub = subscribeToTable('bookings', tenantId, (payload) => {
      const row = payload.new?.date ? mapDbRow(payload.new) : null
      if (!row || row.date !== date) return
      setSlots(prev => {
        const template = prev.length ? prev : generateTemplateSlots(date, tenantId)
        if (row.status !== 'booked') {
          // Booking dibatalkan -> kembalikan slot ke available
          return template.map(s => s.field === row.field && s.start === row.start ? { ...s, id: `${date}_${s.field}_${s.start}`, status: 'available' as const, customer_name: '', customer_wa: '' } : s)
        }
        return mergeBookedRows(template, [row])
      })
    })
    return () => { cancelled = true; sub.unsubscribe() }
  }, [tenantId, date])

  const bookSlot = async (id: string, customerName: string, customerWa: string) => {
    if (!customerName.trim() || !customerWa.trim()) return false
    const current = slots.find(s => s.id === id)
    if (!current || current.status !== 'available') return false
    const next = { ...current, status: 'booked' as const, customer_name: customerName.trim(), customer_wa: customerWa.trim() }
    setSlots(prev => prev.map(s => s.id === id ? next : s))
    if (isSupabaseEnabled()) {
      const row = {
        tenant_id: tenantId,
        date: current.date,
        start_time: current.start,
        end_time: current.end,
        field_no: current.field,
        customer_name: next.customer_name,
        customer_wa: next.customer_wa,
        status: 'booked',
        price: current.price
      }
      const { data: bookedRow, error } = await supabase!.rpc('book_slot_atomic', { p_booking: row })
      if (!error && bookedRow) setSlots(prev => prev.map(s => s.id === id ? { ...s, id: bookedRow.id } : s))
      if (error) {
        setSlots(prev => prev.map(s => s.id === id ? current : s))
        return false
      }
    }
    return true
  }

  const cancelSlot = async (id: string) => {
    const current = slots.find(s => s.id === id)
    if (!current || current.status !== 'booked') return false
    const next = { ...current, status: 'available' as const, customer_name: '', customer_wa: '' }
    setSlots(prev => prev.map(s => s.id === id ? next : s))
    if (isSupabaseEnabled()) {
      const { error } = await supabase!.rpc('cancel_booking_atomic', { p_booking_id: id })
      if (error) {
        setSlots(prev => prev.map(s => s.id === id ? current : s))
        return false
      }
    }
    return true
  }

  return { slots, bookSlot, cancelSlot, refresh: () => setSlots(loadSlots(date, tenantId)) }
}
