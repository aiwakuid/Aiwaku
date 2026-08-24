import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { MetaCloudAdapter } from '../_shared/whatsapp/metaCloudAdapter.ts'

const sha512 = async (text: string) => {
  const hash = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2,'0')).join('')
}

serve(async (req) => {
  try {
    if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })
    const body = await req.json()
    const serverKey = Deno.env.get('MIDTRANS_SERVER_KEY')!
    const expected = await sha512(`${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`)
    if (expected !== body.signature_key) return new Response('Invalid signature', { status: 401 })

    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    const providerOrderId = String(body.order_id)
    const transactionStatus = String(body.transaction_status || '')
    const fraudStatus = String(body.fraud_status || '')

    const { data: payment } = await admin.from('payments').select('*').eq('provider_order_id', providerOrderId).maybeSingle()
    if (!payment) return new Response('OK', { status: 200 })
    if (payment.status === 'paid') return new Response('OK', { status: 200 })

    let status = payment.status
    if (transactionStatus === 'settlement' || (transactionStatus === 'capture' && fraudStatus !== 'challenge')) status = 'paid'
    else if (['cancel','deny'].includes(transactionStatus)) status = 'failed'
    else if (transactionStatus === 'expire') status = 'expired'

    if (status === 'paid') {
      const { error: paidError } = await admin.rpc('mark_payment_paid', {
        p_payment_id: payment.id,
        p_provider_order_id: providerOrderId,
        p_amount: Number(body.gross_amount)
      })
      if (paidError) throw paidError

      // If this payment originated from WhatsApp, notify the same customer
      // after the verified Midtrans webhook changes the payment state.
      const { data: order } = await admin.from('orders').select('id, tenant_id, invoice_no, total, customer_name, customer_wa').eq('id', payment.order_id).maybeSingle()
      if (order) {
        const { data: conversation } = await admin.from('wa_conversations').select('id, tenant_id, customer_wa').eq('tenant_id', order.tenant_id).eq('customer_wa', order.customer_wa).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        const { data: waConfig } = await admin.from('tenant_wa_config').select('*').eq('tenant_id', order.tenant_id).eq('is_active', true).maybeSingle()
        if (conversation && waConfig && waConfig.provider === 'meta_cloud') {
          const adapter = new MetaCloudAdapter()
          const config = { tenantId: order.tenant_id, provider: waConfig.provider, phoneNumberId: waConfig.phone_number_id, webhookVerifyToken: waConfig.webhook_verify_token, credentials: waConfig.credentials }
          const message = `✅ Pembayaran order ${order.invoice_no} berhasil diterima. Total Rp${new Intl.NumberFormat('id-ID').format(Number(order.total || 0))}. Pesanan sedang diproses. Terima kasih!`
          try {
            const sent = await adapter.sendMessage(config, order.customer_wa, { kind: 'text', text: message })
            await admin.from('wa_messages').insert({ conversation_id: conversation.id, tenant_id: order.tenant_id, direction: 'outbound', message_type: 'text', body: message, provider_message_id: sent.providerMessageId })
            await admin.from('wa_conversations').update({ status: 'completed', current_step: 'done', context: { payment_id: payment.id, order_id: order.id, payment_status: 'paid' }, last_message_at: new Date().toISOString() }).eq('id', conversation.id)
          } catch (notifyError) {
            console.error('Pembayaran sudah paid tetapi notifikasi WhatsApp gagal:', notifyError)
          }
        }
      }
    } else {
      await admin.from('payments').update({ status }).eq('id', payment.id)
    }
    return new Response('OK', { status: 200 })
  } catch (e) {
    return new Response(String(e), { status: 400 })
  }
})
