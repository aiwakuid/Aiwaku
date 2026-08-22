// Supabase Edge Function: sync-calendar
// Sync booking/order ke Google Calendar via Calendar API v3 pakai OAuth access token milik tenant.
// Token & refresh token TIDAK boleh disimpan di tabel `tenants` (RLS-nya "allow all" untuk anon
// di schema.sql saat ini) - simpan di tabel terpisah `tenant_secrets` dengan RLS service_role only.
// Lihat catatan RLS di bagian bawah schema.sql.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildCorsHeaders } from "../_shared/cors.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface SyncCalendarBody {
  booking?: any
  order?: any
  tenantName: string
  tenantId?: string
}

async function getGoogleAccessToken(tenantId: string, supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('tenant_secrets')
    .select('google_access_token, google_refresh_token, google_token_expires_at')
    .eq('tenant_id', tenantId)
    .single()

  if (error || !data?.google_access_token) return null

  const expiresAt = data.google_token_expires_at ? new Date(data.google_token_expires_at as string) : null
  if (expiresAt && expiresAt.getTime() > Date.now() + 60_000) {
    return data.google_access_token as string
  }

  // Access token expired -> refresh pakai refresh_token (butuh GOOGLE_CLIENT_ID/SECRET di env)
  if (!data.google_refresh_token) return null
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID')
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')
  if (!clientId || !clientSecret) return null

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: data.google_refresh_token as string,
      grant_type: 'refresh_token'
    })
  })
  if (!resp.ok) return null
  const refreshed = await resp.json()
  const newExpiry = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString()
  await supabase.from('tenant_secrets').update({
    google_access_token: refreshed.access_token,
    google_token_expires_at: newExpiry
  }).eq('tenant_id', tenantId)
  return refreshed.access_token as string
}

function buildEventFromBooking(booking: any) {
  const startDateTime = `${booking.date}T${booking.start}:00`
  const endDateTime = `${booking.date}T${booking.end}:00`
  return {
    summary: `${booking.field} - ${booking.customer_name}`,
    description: `Booking ${booking.field} ${booking.date} ${booking.start}-${booking.end}\nCustomer: ${booking.customer_name} ${booking.customer_wa}\nHarga: Rp${booking.price}\nPowered by aiwaku.id`,
    start: { dateTime: startDateTime, timeZone: 'Asia/Jakarta' },
    end: { dateTime: endDateTime, timeZone: 'Asia/Jakarta' }
  }
}

function buildEventFromOrder(order: any) {
  const start = new Date(order.pickup_time)
  const end = new Date(start.getTime() + 60 * 60 * 1000)
  return {
    summary: `Pickup ${order.customer_name} - ${order.invoice_no}`,
    description: `Order ${order.invoice_no}\nItems: ${(order.items || []).map((i: any) => `${i.name} x${i.qty}`).join(', ')}\nTotal: Rp${order.total}\nPowered by aiwaku.id`,
    start: { dateTime: start.toISOString(), timeZone: 'Asia/Jakarta' },
    end: { dateTime: end.toISOString(), timeZone: 'Asia/Jakarta' }
  }
}

function fallbackGoogleLink(booking: any, order: any, tenantName: string) {
  if (booking) {
    const title = encodeURIComponent(`${tenantName} - ${booking.field} - ${booking.customer_name}`)
    const dates = `${booking.date}T${booking.start}:00/${booking.date}T${booking.end}:00`.replace(/[-:]/g, '')
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}`
  }
  if (order?.pickup_time) {
    const start = new Date(order.pickup_time)
    const end = new Date(start.getTime() + 60 * 60 * 1000)
    const title = encodeURIComponent(`${tenantName} - Pickup ${order.customer_name} - ${order.invoice_no}`)
    const dates = `${start.toISOString().replace(/[-:]/g, '').split('.')[0]}Z/${end.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}`
  }
  return null
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    const body: SyncCalendarBody = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const caller = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: auth } = await caller.auth.getUser()
    if (!auth.user) throw new Error('Unauthorized')
    const tenantId = body.tenantId
    if (!tenantId) throw new Error('tenantId wajib')
    const { data: member } = await supabase.from('tenant_members').select('role').eq('tenant_id', tenantId).eq('user_id', auth.user.id).maybeSingle()
    if (!member) throw new Error('Forbidden')
    const accessToken = tenantId ? await getGoogleAccessToken(tenantId, supabase) : null

    // Mode OAuth: insert event beneran via Calendar API
    if (accessToken) {
      const event = body.booking ? buildEventFromBooking(body.booking) : buildEventFromOrder(body.order)
      const resp = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(event)
      })
      if (resp.ok) {
        const created = await resp.json()
        return new Response(JSON.stringify({
          status: 'synced', mode: 'oauth',
          googleEventId: created.id,
          googleLink: created.htmlLink
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      console.error('Calendar API insert gagal', resp.status, await resp.text())
      // jatuh ke fallback link di bawah kalau API call gagal
    }

    // Fallback: belum connect OAuth -> kembalikan link "tambah ke Calendar" yang owner klik manual
    const googleLink = fallbackGoogleLink(body.booking, body.order, body.tenantName)
    return new Response(JSON.stringify({ status: 'pending', mode: 'link', googleLink }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ status: 'failed', error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
