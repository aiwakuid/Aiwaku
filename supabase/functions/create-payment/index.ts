import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }

serve(async (req) => {
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

    const { data: activePayment } = await admin.from('payments').select('*').eq('order_id', order.id).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).maybeSingle()
    if (activePayment) {
      return new Response(JSON.stringify({ paymentId: activePayment.id, paymentUrl: activePayment.payment_url, providerOrderId: activePayment.provider_order_id, mode: 'existing' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const amount = Math.max(0, Number(order.remaining ?? order.total))
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal pembayaran tidak valid')

    const providerOrderId = `${order.invoice_no}-${Date.now()}`

    const auth = btoa(`${serverKey}:`)
    const midtransRes = await fetch('https://app.midtrans.com/snap/v1/transactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Basic ${auth}` },
      body: JSON.stringify({
        transaction_details: { order_id: providerOrderId, gross_amount: amount },
        customer_details: { first_name: customerName || order.customer_name, phone: order.customer_wa },
        enabled_payments: ['qris']
      })
    })
    const midtrans = await midtransRes.json()
    if (!midtransRes.ok) throw new Error(midtrans?.error_messages?.join(', ') || 'Midtrans gagal')

    const { data: paymentRow, error: paymentInsertError } = await admin.from('payments').insert({
      tenant_id: order.tenant_id, order_id: order.id, provider: 'midtrans', provider_order_id: providerOrderId,
      amount, status: 'pending', payment_url: midtrans.redirect_url, created_at: new Date().toISOString()
    }).select('*').single()
    if (paymentInsertError) throw paymentInsertError
    return new Response(JSON.stringify({
      paymentId: paymentRow.id, paymentUrl: midtrans.redirect_url, token: midtrans.token,
      providerOrderId, mode: 'midtrans'
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
