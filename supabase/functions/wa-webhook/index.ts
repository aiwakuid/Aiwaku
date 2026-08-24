// wa-webhook — SATU endpoint untuk SEMUA tenant. Routing tenant tidak
// lagi pakai query param (`?tenant=<slug>`) — itu keputusan awal yang
// salah, dikoreksi setelah review kedua. Routing sekarang murni dari
// `metadata.phone_number_id` di payload, dicocokkan ke
// `tenant_wa_config.phone_number_id` (sudah UNIQUE dari migration V60).
// Ini juga otomatis kompatibel kalau nanti AIWAKU jadi WhatsApp Tech
// Provider/BSP resmi yang menaungi banyak nomor di satu Meta App —
// tidak perlu desain ulang routing.
//
// Verifikasi handshake GET pakai SATU secret platform
// (`WA_WEBHOOK_VERIFY_TOKEN` env var), bukan token per-tenant. Ini aman
// karena verify_token cuma bukti kepemilikan URL saat setup awal —
// keamanan pesan sesungguhnya ada di HMAC signature (X-Hub-Signature-256)
// yang dicek per-tenant pakai app_secret masing-masing di tahap POST.
//
// STATUS: ditulis mengikuti dokumentasi resmi Meta (Agustus 2026) dan
// dites offline (HMAC signature, parseInbound, extractPhoneNumberId) —
// BELUM PERNAH dites terhadap Meta App/nomor WA asli karena kredensial
// production belum ada.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { MetaCloudAdapter } from '../_shared/whatsapp/metaCloudAdapter.ts'
import { routeMessage, type ConversationState, type BusinessFlow } from '../_shared/whatsapp/flowEngine.ts'
import type { TenantWaConfig } from '../_shared/whatsapp/types.ts'

const adapter = new MetaCloudAdapter()

serve(async (req) => {
  const url = new URL(req.url)
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const admin = createClient(supabaseUrl, serviceKey)

  // ------------------------------------------------------------
  // GET — handshake verifikasi webhook (dipanggil oleh Meta saat tenant
  // men-submit Callback URL ini di App Dashboard mereka). Semua tenant
  // memakai URL yang SAMA dan verify_token platform yang SAMA.
  // ------------------------------------------------------------
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode')
    const token = url.searchParams.get('hub.verify_token')
    const challenge = url.searchParams.get('hub.challenge')
    const platformToken = Deno.env.get('WA_WEBHOOK_VERIFY_TOKEN')

    if (mode !== 'subscribe' || !token || !challenge) return new Response('Bad Request', { status: 400 })
    if (!platformToken || token !== platformToken) return new Response('Forbidden', { status: 403 })
    return new Response(challenge, { status: 200 })
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 })

  // ------------------------------------------------------------
  // POST — pesan/event masuk. Baca raw body SEKALI (dipakai buat parse
  // JSON dan verifikasi signature), jangan baca stream dua kali.
  // ------------------------------------------------------------
  const rawBody = await req.text()
  let parsedBody: unknown
  try {
    parsedBody = JSON.parse(rawBody)
  } catch {
    return new Response('Bad Request: invalid JSON', { status: 400 })
  }

  const phoneNumberId = adapter.extractPhoneNumberId(parsedBody)
  if (!phoneNumberId) return new Response('OK', { status: 200 }) // bukan payload pesan yang kita kenali, ack saja

  const { data: waConfigRow } = await admin.from('tenant_wa_config').select('*').eq('phone_number_id', phoneNumberId).maybeSingle()
  if (!waConfigRow || !waConfigRow.is_active) {
    // Nomor tidak dikenal / tenant nonaktifkan WA -> tetap ack 200 supaya
    // Meta tidak retry berulang, tapi tidak proses apapun.
    return new Response('OK', { status: 200 })
  }

  const { data: tenant } = await admin.from('tenants').select('id, niche, flow_type').eq('id', waConfigRow.tenant_id).maybeSingle()
  if (!tenant) return new Response('OK', { status: 200 })

  const config: TenantWaConfig = {
    tenantId: tenant.id,
    provider: waConfigRow.provider,
    phoneNumberId: waConfigRow.phone_number_id,
    webhookVerifyToken: waConfigRow.webhook_verify_token,
    credentials: waConfigRow.credentials,
  }

  const signatureHeader = req.headers.get('x-hub-signature-256')
  const validSignature = await adapter.verifyWebhook(rawBody, signatureHeader, config)
  if (!validSignature) return new Response('Unauthorized', { status: 401 })

  const inbound = adapter.parseInbound(parsedBody)
  if (!inbound) return new Response('OK', { status: 200 }) // status update dsb, bukan pesan customer

  // Dedupe: Meta bisa kirim ulang webhook yang sama (retry sampai 7 hari
  // kalau endpoint kita pernah gagal balas 200). Tanpa ini, retry bisa
  // memicu double-processing (mis. order dibuat dua kali).
  const { data: existingMsg } = await admin.from('wa_messages').select('id').eq('provider_message_id', inbound.providerMessageId).eq('tenant_id', tenant.id).maybeSingle()
  if (existingMsg) return new Response('OK', { status: 200 })

  // Load atau buat conversation aktif.
  let { data: conversation } = await admin.from('wa_conversations').select('*').eq('tenant_id', tenant.id).eq('customer_wa', inbound.customerWa).eq('status', 'active').maybeSingle()

  if (!conversation) {
    // flow_type sekarang datang dari kolom tenants.flow_type (diisi saat
    // registrasi via register_tenant_atomic, backfilled utk tenant lama
    // di migration V63) — bukan Set hardcoded di edge function ini lagi.
    const flowType = (tenant.flow_type || 'booking') as BusinessFlow
    const { data: created, error: createErr } = await admin.from('wa_conversations').insert({
      tenant_id: tenant.id, customer_wa: inbound.customerWa, flow_type: flowType, current_step: 'greeting', context: {},
    }).select('*').single()
    if (createErr) {
      console.error('Gagal membuat wa_conversation:', createErr)
      return new Response('OK', { status: 200 }) // ack tetap 200, jangan sampai Meta retry terus karena bug kita
    }
    conversation = created
  }

  await admin.from('wa_messages').insert({
    conversation_id: conversation.id,
    tenant_id: tenant.id,
    direction: 'inbound',
    message_type: inbound.buttonReplyId ? 'interactive_button' : inbound.listReplyId ? 'interactive_list' : 'text',
    body: inbound.text ?? inbound.buttonReplyId ?? inbound.listReplyId ?? null,
    provider_message_id: inbound.providerMessageId,
    raw_payload: inbound.raw,
  })

  const catalog = conversation.flow_type === 'order'
    ? ((await admin.from('menus').select('id, name, price, stock, is_active, description').eq('tenant_id', tenant.id).eq('is_active', true).order('name').limit(500)).data || [])
    : []

  const state: ConversationState = {
    id: conversation.id, tenantId: tenant.id, flowType: conversation.flow_type as BusinessFlow, currentStep: conversation.current_step, context: conversation.context || {}, catalog,
  }
  const result = routeMessage(state, inbound)
  const mergedContext = { ...state.context, ...result.contextPatch }

  await admin.from('wa_conversations').update({
    current_step: result.nextStep,
    context: mergedContext,
    status: result.status ?? 'active',
    last_message_at: new Date().toISOString(),
  }).eq('id', conversation.id)

  for (const reply of result.replies) {
    try {
      const sent = await adapter.sendMessage(config, inbound.customerWa, reply)
      await admin.from('wa_messages').insert({
        conversation_id: conversation.id, tenant_id: tenant.id, direction: 'outbound',
        message_type: reply.kind === 'text' ? 'text' : reply.kind === 'button_list' ? 'interactive_button' : 'interactive_list',
        body: reply.kind === 'text' ? reply.text : reply.text,
        provider_message_id: sent.providerMessageId,
      })
    } catch (err) {
      console.error('Gagal kirim balasan WA:', err)
      // Sengaja tidak melempar error ke Meta (tetap ack 200 di akhir) —
      // kegagalan kirim balasan dicatat di log, bukan bikin Meta retry
      // seluruh webhook (yang bisa memicu re-proses step yang sudah jalan).
    }
  }

  if (result.sideEffect?.type === 'create_order') {
    const items = Array.isArray(mergedContext.pendingOrderItems) ? mergedContext.pendingOrderItems : []
    const idempotencyKey = `wa:${conversation.id}:${mergedContext.pendingOrderText || ''}`
    try {
      const { data: order, error: orderError } = await admin.rpc('bot_create_order_atomic', {
        p_tenant_id: tenant.id,
        p_customer_wa: inbound.customerWa,
        p_customer_name: mergedContext.customerName || inbound.customerName || inbound.customerWa,
        p_items: items.map((i: any) => ({ menu_id: i.menu_id, qty: i.qty })),
        p_conversation_id: conversation.id,
        p_idempotency_key: idempotencyKey,
      })
      if (orderError) throw orderError

      const orderTotal = Number(order.total || 0)
      if (result.sideEffect.paymentMethod === 'cash') {
        const { data: paid, error: cashError } = await admin.rpc('bot_record_cash_payment', {
          p_tenant_id: tenant.id, p_order_id: order.id, p_amount: orderTotal, p_conversation_id: conversation.id,
        })
        if (cashError) throw cashError
        await admin.from('wa_conversations').update({ status: 'completed', current_step: 'done', context: { ...mergedContext, order_id: order.id, payment_id: paid?.payment?.id, order_status: paid?.order?.status || 'lunas' } }).eq('id', conversation.id)
        await admin.from('wa_messages').insert({ conversation_id: conversation.id, tenant_id: tenant.id, direction: 'outbound', message_type: 'text', body: `Pesanan ${order.invoice_no} berhasil dibuat dan pembayaran tunai dicatat. Total Rp${new Intl.NumberFormat('id-ID').format(orderTotal)}. Terima kasih!` })
        try { await adapter.sendMessage(config, inbound.customerWa, { kind: 'text', text: `✅ Pesanan ${order.invoice_no} berhasil dibuat. Pembayaran tunai sudah dicatat. Total Rp${new Intl.NumberFormat('id-ID').format(orderTotal)}. Terima kasih!` }) } catch (err) { console.error('Gagal kirim konfirmasi cash:', err) }
      } else {
        await admin.from('wa_conversations').update({ current_step: 'awaiting_qris_payment', context: { ...mergedContext, order_id: order.id, order_total: orderTotal } }).eq('id', conversation.id)
        const functionUrl = `${supabaseUrl}/functions/v1/bot-create-payment`
        const internalSecret = Deno.env.get('AIWAKU_INTERNAL_FUNCTION_SECRET')
        if (!internalSecret) throw new Error('AIWAKU_INTERNAL_FUNCTION_SECRET belum dikonfigurasi')
        const paymentResponse = await fetch(functionUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-aiwaku-internal-secret': internalSecret }, body: JSON.stringify({ orderId: order.id, tenantId: tenant.id, customerName: mergedContext.customerName || inbound.customerName || inbound.customerWa }) })
        const payment = await paymentResponse.json()
        if (!paymentResponse.ok) throw new Error(payment?.error || 'Gagal membuat QRIS')
        const text = payment.qrImageUrl ? `✅ Order ${order.invoice_no} dibuat. Silakan bayar QRIS di sini: ${payment.qrImageUrl}` : `✅ Order ${order.invoice_no} dibuat. Silakan selesaikan pembayaran: ${payment.paymentUrl}`
        await admin.from('wa_conversations').update({ current_step: 'awaiting_qris_payment', context: { ...mergedContext, order_id: order.id, payment_id: payment.paymentId, payment_url: payment.paymentUrl, qr_image_url: payment.qrImageUrl, order_total: orderTotal } }).eq('id', conversation.id)
        try { await adapter.sendMessage(config, inbound.customerWa, { kind: 'text', text }) } catch (err) { console.error('Gagal kirim QRIS:', err) }
      }
    } catch (err) {
      console.error('Gagal memproses order WhatsApp:', err)
      await admin.from('wa_conversations').update({ status: 'handoff_human', current_step: 'processing_order', context: { ...mergedContext, processing_error: String(err) } }).eq('id', conversation.id)
      try { await adapter.sendMessage(config, inbound.customerWa, { kind: 'text', text: 'Maaf, pesanan belum bisa diproses otomatis. Admin akan membantu melanjutkannya.' }) } catch (sendErr) { console.error('Gagal kirim handoff:', sendErr) }
    }
  }

  return new Response('OK', { status: 200 })
})
