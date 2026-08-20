
import type { BookingSlot, Order } from '../types'
import { supabase, isSupabaseEnabled } from './supabase'

// Google Calendar integration - 2 modes: OAuth (production) and ICS link (MVP cepat)

const CTZ = 'Asia/Jakarta'

function toGCalDateTime(date: string, time: string): string | null {
  // Hasil: YYYYMMDDTHHMMSS (floating time, dipasangkan dengan &ctz=Asia/Jakarta)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}/.test(time)) return null
  return `${date.replace(/-/g,'')}T${time.replace(':','')}00`
}

export async function syncBookingToGoogleCalendar(booking: BookingSlot, tenantName: string, tenantId?: string) {
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase!.functions.invoke('sync-calendar', {
        body: { booking, tenantName, tenantId }
      })
      if (!error && data) return data
    } catch (e) {
      console.warn('Calendar edge function not deployed, fallback to ICS', e)
    }
  }

  // FALLBACK MVP: Generate Google Calendar link (works tanpa OAuth, owner tinggal klik)
  const startDate = toGCalDateTime(booking.date, booking.start)
  const endDate = toGCalDateTime(booking.date, booking.end)
  if (!startDate || !endDate) return null // tanggal/jam tidak valid -> jangan hasilkan link rusak

  const title = encodeURIComponent(`${tenantName} - ${booking.field} - ${booking.customer_name}`)
  const details = encodeURIComponent(`Booking ${booking.field} ${booking.date} ${booking.start}-${booking.end}\nCustomer: ${booking.customer_name} ${booking.customer_wa}\nPrice: Rp${booking.price.toLocaleString('id-ID')}\nPowered by aiwaku.id`)

  const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${startDate}/${endDate}&ctz=${CTZ}&location=${encodeURIComponent(tenantName)}`

  const icsLines = [
    'BEGIN:VCALENDAR','VERSION:2.0','BEGIN:VEVENT',
    `SUMMARY:${booking.field} - ${booking.customer_name}`,
    `DTSTART:${startDate}`,`DTEND:${endDate}`,
    'END:VEVENT','END:VCALENDAR'
  ].join('\r\n')

  return {
    googleLink,
    icsUrl: `data:text/calendar;charset=utf8,${encodeURIComponent(icsLines)}`,
    status: 'pending' as const,
    mode: 'link'
  }
}

export async function syncOrderToGoogleCalendar(order: Order, tenantName: string, tenantId?: string) {
  if (!order.pickup_time) return null
  if (isSupabaseEnabled()) {
    try {
      const { data, error } = await supabase!.functions.invoke('sync-calendar', {
        body: { order, tenantName, tenantId }
      })
      if (!error && data) return data
    } catch (e) {
      console.warn('Calendar edge function not deployed, fallback to link', e)
    }
  }

  const start = new Date(order.pickup_time)
  // FIX: pickup_time non-ISO -> Invalid Date -> toISOString() melempar RangeError
  // dan memutus seluruh alur P2 di halaman Invoice. Validasi dulu.
  if (isNaN(start.getTime())) {
    console.warn('pickup_time bukan tanggal valid, skip calendar sync:', order.pickup_time)
    return null
  }
  const end = new Date(start.getTime() + 60*60*1000) // +1 hour

  const title = encodeURIComponent(`${tenantName} - Pickup ${order.customer_name} - ${order.invoice_no}`)
  const details = encodeURIComponent(`Order ${order.invoice_no}\nCustomer: ${order.customer_name}\nItems: ${order.items.map(i=>i.name+' x'+i.qty).join(', ')}\nTotal: Rp${order.total.toLocaleString('id-ID')}\nCustom: ${order.custom_text || '-'}\nPowered by aiwaku.id`)

  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'
  const googleLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}&dates=${fmt(start)}/${fmt(end)}`

  return { googleLink, status: 'pending' as const }
}

export function getCalendarIntegrationStatus() {
  const hasGoogleToken = localStorage.getItem('aiwaku_google_token')
  return {
    connected: !!hasGoogleToken,
    mode: hasGoogleToken ? 'oauth' : 'link',
    message: hasGoogleToken ? '✅ Google Calendar OAuth connected' : '⚠️ Mode link (klik untuk tambah ke Google Calendar) - Connect OAuth di Settings untuk auto sync'
  }
}
