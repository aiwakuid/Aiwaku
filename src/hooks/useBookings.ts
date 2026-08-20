
import { useState, useEffect, useRef } from 'react'
import type { BookingSlot } from '../types'
import { supabase, isSupabaseEnabled, subscribeToTable } from '../lib/supabase'

const STORAGE_KEY = 'aiwaku_v5_bookings'

// Deterministic pseudo-random: slot yang sama selalu punya status yang sama
// (tidak berubah-ubah setiap refresh seperti Math.random())
function hashCode(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return Math.abs(h)
}

function generateSlots(date: string, tenantId: string): BookingSlot[] {
  const fields = ['Lapangan 1','Lapangan 2','Lapangan 3']
  const hours = [
    {start:'07:00', end:'08:00', price: 150000},
    {start:'08:00', end:'09:00', price: 150000},
    {start:'09:00', end:'10:00', price: 150000},
    {start:'10:00', end:'11:00', price: 180000},
    {start:'18:00', end:'19:00', price: 250000},
    {start:'19:00', end:'20:00', price: 250000},
    {start:'20:00', end:'21:00', price: 250000},
  ]
  const slots: BookingSlot[] = []
  fields.forEach(field=>{
    hours.forEach(h=>{
      const booked = hashCode(`${date}|${field}|${h.start}`) % 10 < 3
      slots.push({
        id: `${date}_${field}_${h.start}`,
        tenant_id: tenantId,
        date,
        start: h.start,
        end: h.end,
        field,
        customer_name: booked ? 'Booked' : '',
        customer_wa: '',
        status: booked ? 'booked' : 'available',
        price: h.price,
        created_at: new Date().toISOString()
      })
    })
  })
  return slots
}

function loadSlots(date: string, tenantId: string): BookingSlot[] {
  try {
    const raw = localStorage.getItem(`${STORAGE_KEY}_${tenantId}_${date}`)
    if (raw) {
      const parsed = JSON.parse(raw) as BookingSlot[]
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].date === date) return parsed
    }
  } catch {}
  return generateSlots(date, tenantId)
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
    supabase!.from('bookings').select('*').eq('tenant_id', tenantId).eq('date', date).then(({data})=>{
      if (data && data.length>0) setSlots(data as any)
    })
    const sub = subscribeToTable('bookings', tenantId, (payload)=>{
      if (payload.new?.date === date) {
        setSlots(prev=>{
          const idx = prev.findIndex(s=>s.id===payload.new.id)
          if (idx>=0) {
            const copy = [...prev]
            copy[idx]=payload.new as BookingSlot
            return copy
          }
          return [payload.new as BookingSlot, ...prev]
        })
      }
    })
    return () => sub.unsubscribe()
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

  return { slots, bookSlot, cancelSlot, refresh: ()=> setSlots(generateSlots(date, tenantId)) }
}
