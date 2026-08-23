import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const secret = Deno.env.get('AIWAKU_INTERNAL_FUNCTION_SECRET')
    if (!secret || req.headers.get('x-aiwaku-internal-secret') !== secret) return new Response('Forbidden', { status: 403 })
    const { orderId, tenantId, customerName } = await req.json()
    if (!orderId || !tenantId) throw new Error('orderId dan tenantId wajib')
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')
    if (!serverKey) throw new Error('MIDTRANS_SERVER_KEY belum dikonfigurasi')
    const admin = createClient(supabaseUrl, serviceKey)
    const { data: order, error: orderError } = await admin.from('orders').select('*').eq('id', orderId).eq('tenant_id', tenantId).single()
    if (orderError || !order) throw new Error('Order tidak ditemukan')
    if (['batal','lunas'].includes(order.status)) throw new Error('Order tidak dapat dibayar')
    const amount = Math.max(0, Number(order.remaining ?? order.total))
    if (!Number.isInteger(amount) || amount <= 0) throw new Error('Nominal pembayaran tidak valid')
    const { data: reserved, error: reserveError } = await admin.rpc('reserve_pending_payment_atomic', { p_order_id: order.id, p_tenant_id: tenantId, p_amount: amount })
    if (reserveError) throw reserveError
    const existing = reserved?.payment
    if (reserved?.mode === 'existing' && existing?.payment_url && existing?.provider_order_id) {
      return new Response(JSON.stringify({ paymentId: existing.id, paymentUrl: existing.payment_url, providerOrderId: existing.provider_order_id }), { headers: { 'Content-Type': 'application/json' } })
    }
    if (!existing?.id) throw new Error('Reservasi payment gagal')
    const providerOrderId = `${order.invoice_no}-WA-${Date.now()}`
    const midtransRes = await fetch('https://app.midtrans.com/snap/v1/transactions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${serverKey}:`)}` },
      body: JSON.stringify({ transaction_details: { order_id: providerOrderId, gross_amount: amount }, customer_details: { first_name: customerName || order.customer_name, phone: order.customer_wa }, enabled_payments: ['qris'] }),
    })
    const midtrans = await midtransRes.json()
    if (!midtransRes.ok) {
      await admin.from('payments').delete().eq('id', existing.id).eq('status', 'pending')
      throw new Error(midtrans?.error_messages?.join(', ') || 'Midtrans gagal')
    }
    const { data: attached, error: attachError } = await admin.rpc('attach_midtrans_details_atomic', { p_payment_id: existing.id, p_provider_order_id: providerOrderId, p_payment_url: midtrans.redirect_url })
    if (attachError) throw attachError
    return new Response(JSON.stringify({ paymentId: attached.id, paymentUrl: attached.payment_url, providerOrderId: attached.provider_order_id, token: midtrans.token }), { headers: { 'Content-Type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 400, headers: { 'Content-Type': 'application/json' } })
  }
})
