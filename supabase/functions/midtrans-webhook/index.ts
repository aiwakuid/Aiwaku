import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

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
    } else {
      await admin.from('payments').update({ status }).eq('id', payment.id)
    }
    return new Response('OK', { status: 200 })
  } catch (e) {
    return new Response(String(e), { status: 400 })
  }
})
