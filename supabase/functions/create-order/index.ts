import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildCorsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })

    const body = await req.json()
    const { tenantId, customerName, customerWa, items, discount = 0, tax = 0, pickupTime = null, customText = null, idempotencyKey } = body

    if (!tenantId || !Array.isArray(items) || items.length === 0) {
      throw new Error('Data order tidak lengkap')
    }
    if (items.length > 50) throw new Error('Terlalu banyak item')

    const url = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const admin = createClient(url, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')
    const token = authHeader.replace(/^Bearer\s+/i, '')

    const caller = createClient(url, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })
    const { data: auth } = await caller.auth.getUser()
    if (!auth.user) throw new Error('Unauthorized')

    const { data: member } = await admin.from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', auth.user.id)
      .maybeSingle()

    if (!member) throw new Error('Forbidden')

    // FASE 2 #10: rate limit sederhana per user per tenant (20 percobaan/menit).
    const { data: withinLimit, error: rateLimitError } = await admin.rpc('check_rate_limit', {
      p_subject: `${tenantId}:${auth.user.id}`,
      p_action: 'create-order',
      p_limit: 20,
      p_window_seconds: 60,
    })
    if (rateLimitError) throw rateLimitError
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const normalizedItems = items.map((item: any) => ({
      menu_id: String(item.menu_id || item.menuId || ''),
      qty: Math.floor(Number(item.qty ?? item.quantity) || 0)
    }))
    const key = String(idempotencyKey || crypto.randomUUID())
    if (key.length > 128) throw new Error('Idempotency key terlalu panjang')

    // FASE 2 #13: p_user_id dioper eksplisit karena RPC dipanggil lewat client
    // service-role (admin) - auth.uid() akan null di konteks itu. Identitas
    // user sudah diverifikasi di atas lewat caller.auth.getUser() + cek membership.
    const { data, error } = await admin.rpc('create_order_atomic', {
      p_tenant_id: tenantId,
      p_customer_name: String(customerName || '').slice(0, 120),
      p_customer_wa: String(customerWa || '').slice(0, 40),
      p_items: normalizedItems,
      p_discount: Math.max(0, Math.floor(Number(discount) || 0)),
      p_tax: Math.max(0, Math.floor(Number(tax) || 0)),
      p_pickup_time: pickupTime,
      p_custom_text: String(customText || '').slice(0, 500),
      p_idempotency_key: key,
      p_user_id: auth.user.id
    })

    if (error) throw error

    return new Response(JSON.stringify({ order: data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
