// Supabase Edge Function: sync-sheets
// Append row order/booking ke Google Sheets via Sheets API v4 pakai OAuth token tenant.
// Sama seperti sync-calendar, token disimpan di tabel `tenant_secrets` (service_role only).

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildCorsHeaders } from "../_shared/cors.ts"

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface SyncSheetsBody {
  type: 'order' | 'booking' | 'menu'
  data: any
  tenantName: string
  tenantId?: string
}

async function getGoogleAccessToken(tenantId: string, supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from('tenant_secrets')
    .select('google_access_token, sheets_spreadsheet_id')
    .eq('tenant_id', tenantId)
    .single()
  if (error) return null
  return data
}

function rowFromOrder(order: any) {
  return [
    order.invoice_no, order.customer_name, order.customer_wa,
    (order.items || []).map((i: any) => `${i.name} x${i.qty}`).join('; '),
    order.total, order.dp, order.remaining, order.status,
    order.pickup_time || '', order.custom_text || '',
    new Date(order.created_at).toLocaleString('id-ID')
  ]
}

function rowFromBooking(b: any) {
  return [b.id, b.field, b.date, `${b.start}-${b.end}`, b.customer_name, b.customer_wa, b.price, b.status, new Date(b.created_at).toLocaleString('id-ID')]
}

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    const body: SyncSheetsBody = await req.json()
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const caller = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } })
    const { data: auth } = await caller.auth.getUser()
    if (!auth.user) throw new Error('Unauthorized')
    if (!body.tenantId) throw new Error('tenantId wajib')
    const { data: member } = await supabase.from('tenant_members').select('role').eq('tenant_id', body.tenantId).eq('user_id', auth.user.id).maybeSingle()
    if (!member) throw new Error('Forbidden')

    const secrets = body.tenantId ? await getGoogleAccessToken(body.tenantId, supabase) : null

    if (secrets?.google_access_token && secrets?.sheets_spreadsheet_id) {
      const row = body.type === 'booking' ? rowFromBooking(body.data) : rowFromOrder(body.data)
      const sheetName = body.type === 'booking' ? 'Bookings' : 'Orders'
      const range = `${sheetName}!A:Z`
      const resp = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${secrets.sheets_spreadsheet_id}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${secrets.google_access_token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ values: [row] })
        }
      )
      if (resp.ok) {
        return new Response(JSON.stringify({
          status: 'synced', mode: 'api',
          sheetUrl: `https://docs.google.com/spreadsheets/d/${secrets.sheets_spreadsheet_id}`
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      console.error('Sheets API append gagal', resp.status, await resp.text())
    }

    // Fallback: belum connect Sheets API -> kembalikan baris CSV untuk export manual
    const row = body.type === 'booking' ? rowFromBooking(body.data) : rowFromOrder(body.data)
    const csvRow = row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
    return new Response(JSON.stringify({ status: 'pending', mode: 'csv', csvRow }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ status: 'failed', error: String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
