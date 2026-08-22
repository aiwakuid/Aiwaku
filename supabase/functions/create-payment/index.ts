import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { buildCorsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req)
  try {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders })
    const { orderId, customerName } = await req.json()
    if (!orderId) throw new Error('orderId wajib')

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
    const admin = createClient(supabaseUrl, serviceKey)

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Unauthorized')
    const token = authHeader.replace(/^Bearer\s+/i, '')
    const userClient = createClient(supabaseUrl, serviceKey, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    })
    const { data: auth } = await userClient.auth.getUser()
    if (!auth.user) throw new Error('Unauthorized')

    const { data: order, error } = await admin.from('orders').select('*').eq('id', orderId).single()
    if (error || !order) throw new Error('Order tidak ditemukan')
    const { data: member } = await admin
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', order.tenant_id)
      .eq('user_id', auth.user.id)
      .maybeSingle()
    if (!member) throw new Error('Forbidden')
    if (['batal','lunas'].includes(order.status)) throw new Error('Order tidak dapat dibayar')
    if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi')

    // FASE 2 #10: rate limit sederhana per user per tenant (10 percobaan/menit).
    const { data: withinLimit, error: rateLimitError } = await admin.rpc('check_rate_limit', {
      p_subject: `${order.tenant_id}:${auth.user.id}`,
      p_action: 'create-payment',
      p_limit: 10,
      p_window_seconds: 60,
    })
    if (rateLimitError) throw rateLimitError
    if (!withinLimit) {
      return new Response(JSON.stringify({ error: 'Terlalu banyak percobaan pembayaran. Coba lagi sebentar lagi.' }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const amount = Math.max(0, Number(order.remaining ?? order.total))
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal pembayaran tidak valid')

    // FASE 2 #9: reservasi pending payment secara atomic (lock order + unique index)
    // SEBELUM memanggil Midtrans, supaya dua request bersamaan tidak pernah membuat
    // dua payment pending untuk order yang sama.
    const { data: reserved, error: reserveError } = await admin.rpc('reserve_pending_payment_atomic', {
      p_order_id: order.id,
      p_tenant_id: order.tenant_id,
      p_amount: amount,
    })
    if (reserveError) throw reserveError

    const existingPayment = reserved?.payment
    if (reserved?.mode === 'existing') {
      if (!existingPayment?.payment_url || !existingPayment?.provider_order_id) {
        // Request lain sedang di tengah proses reservasi -> jangan panggil Midtrans dobel.
        return new Response(JSON.stringify({ error: 'Pembayaran sedang diproses, coba lagi dalam beberapa detik.' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({
        paymentId: existingPayment.id,
        paymentUrl: existingPayment.payment_url,
        providerOrderId: existingPayment.provider_order_id,
        mode: 'existing'
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const reservedPaymentId = existingPayment.id
    const providerOrderId = `${order.invoice_no}-${Date.now()}`

    const basicAuth = btoa(`${serverKey}:`)
    const midtransRes = await fetch('https://app.midtrans.com/snap/v1/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${basicAuth}` },
      body: JSON.stringify({
        transaction_details: { order_id: providerOrderId, gross_amount: amount },
        customer_details: { first_name: customerName || order.customer_name, phone: order.customer_wa },
        enabled_payments: ['qris']
      })
    })
    const midtrans = await midtransRes.json()
    if (!midtransRes.ok) {
      // Reservasi gagal ditindaklanjuti — hapus placeholder supaya tidak mengunci order selamanya.
      await admin.from('payments').delete().eq('id', reservedPaymentId).eq('status', 'pending')
      throw new Error(midtrans?.error_messages?.join(', ') || 'Midtrans gagal')
    }

    const { data: attached, error: attachError } = await admin.rpc('attach_midtrans_details_atomic', {
      p_payment_id: reservedPaymentId,
      p_provider_order_id: providerOrderId,
      p_payment_url: midtrans.redirect_url,
    })
    if (attachError) throw attachError

    return new Response(JSON.stringify({
      paymentId: attached.id, paymentUrl: attached.payment_url, token: midtrans.token,
      providerOrderId: attached.provider_order_id, mode: 'midtrans'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
