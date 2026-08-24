import type { WhatsAppProviderAdapter } from './adapter.ts'
import type { NormalizedInboundMessage, OutboundMessage, SendResult, TenantWaConfig } from './types.ts'

// Implementasi untuk Meta WhatsApp Cloud API.
// Sumber: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview
//         https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages
// Diverifikasi Agustus 2026. BELUM PERNAH dites terhadap Meta App/nomor
// WA asli (kita belum punya App ID/access token production) — logic HMAC
// signature sudah dites offline (lihat catatan di wa-webhook/index.ts),
// tapi parseInbound/sendMessage baru divalidasi terhadap CONTOH payload
// dari dokumentasi resmi, bukan traffic asli.
//
// credentials di tenant_wa_config untuk provider ini WAJIB berbentuk:
//   { "access_token": "...", "app_secret": "...", "api_version": "v21.0" }

const GRAPH_BASE = 'https://graph.facebook.com'

export class MetaCloudAdapter implements WhatsAppProviderAdapter {
  // Dipakai untuk verifikasi POST (signature), BUKAN untuk GET handshake
  // subscribe — itu ditangani terpisah di wa-webhook/index.ts karena
  // butuh raw body string (bukan objek yang sudah di-parse) dan config
  // tenant yang match ditentukan dari path URL, bukan dari payload.
  async verifyWebhook(rawBody: string, signatureHeader: string | null, config: TenantWaConfig): Promise<boolean> {
    if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false

    const appSecret = (config.credentials as any)?.app_secret
    if (!appSecret) return false

    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody))
    const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('')
    const expected = `sha256=${hex}`

    // Constant-time-ish compare (panjang sama karena keduanya hasil hex
    // digest tetap 64 char + prefix) — mencegah timing attack sederhana.
    if (expected.length !== signatureHeader.length) return false
    let diff = 0
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signatureHeader.charCodeAt(i)
    return diff === 0
  }

  // Dipanggil SEBELUM tenant config ter-load — semata cari tahu tenant
  // mana pemilik phone_number_id ini, supaya bisa lookup tenant_wa_config
  // yang benar lalu verifikasi signature pakai app_secret tenant itu.
  extractPhoneNumberId(rawBody: unknown): string | null {
    const body = rawBody as any
    return body?.entry?.[0]?.changes?.[0]?.value?.metadata?.phone_number_id ?? null
  }

  parseInbound(rawBody: unknown): NormalizedInboundMessage | null {
    const body = rawBody as any
    const change = body?.entry?.[0]?.changes?.[0]?.value
    const message = change?.messages?.[0]
    if (!message) return null // status update / bukan pesan customer -> caller harus tetap ack 200

    const phoneNumberId = change?.metadata?.phone_number_id
    const customerWa = message.from
    const customerName = change?.contacts?.[0]?.profile?.name

    if (!phoneNumberId || !customerWa) return null

    const base: Omit<NormalizedInboundMessage, 'text' | 'buttonReplyId' | 'listReplyId'> = {
      tenantPhoneNumberId: phoneNumberId,
      customerWa,
      customerName,
      providerMessageId: message.id,
      raw: body,
    }

    if (message.type === 'text') {
      return { ...base, text: message.text?.body }
    }
    if (message.type === 'interactive') {
      if (message.interactive?.type === 'button_reply') {
        return { ...base, buttonReplyId: message.interactive.button_reply?.id }
      }
      if (message.interactive?.type === 'list_reply') {
        return { ...base, listReplyId: message.interactive.list_reply?.id }
      }
    }
    // Tipe lain (image, location, dst) belum didukung flow engine saat
    // ini -> tetap dinormalisasi sebagai pesan "kosong" supaya wa-webhook
    // bisa balas "belum bisa proses tipe pesan ini" daripada diam saja.
    return { ...base, text: undefined }
  }

  async sendMessage(config: TenantWaConfig, customerWa: string, message: OutboundMessage): Promise<SendResult> {
    const accessToken = (config.credentials as any)?.access_token
    const apiVersion = (config.credentials as any)?.api_version || 'v21.0'
    if (!accessToken) throw new Error('Meta access_token belum dikonfigurasi untuk tenant ini')

    const url = `${GRAPH_BASE}/${apiVersion}/${config.phoneNumberId}/messages`
    let payload: Record<string, unknown>

    if (message.kind === 'text') {
      payload = { messaging_product: 'whatsapp', to: customerWa, type: 'text', text: { body: message.text } }
    } else if (message.kind === 'button_list') {
      // Meta membatasi maksimal 3 tombol per pesan interactive.button —
      // jangan diam-diam potong; kalau lebih dari 3, ini bug pemanggil
      // (flow engine seharusnya sudah tahu batasan ini).
      if (message.buttons.length > 3) throw new Error('Meta Cloud API maksimal 3 tombol per pesan interactive')
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: customerWa,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.text },
          action: { buttons: message.buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.label } })) },
        },
      }
    } else {
      // interactive_list: Meta batasi total 10 rows across semua section
      const totalRows = message.sections.reduce((n, s) => n + s.items.length, 0)
      if (totalRows > 10) throw new Error('Meta Cloud API maksimal 10 baris list per pesan')
      payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: customerWa,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: message.text },
          action: {
            button: 'Pilih',
            sections: message.sections.map(s => ({ title: s.title, rows: s.items.map(i => ({ id: i.id, title: i.label, description: i.description })) })),
          },
        },
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify(payload),
    })
    const json = await res.json()
    if (!res.ok) {
      // Format error Meta: { error: { message, type, code, error_subcode, fbtrace_id } }
      throw new Error(`Meta Cloud API error: ${json?.error?.message || res.statusText}`)
    }
    return { providerMessageId: json?.messages?.[0]?.id || '' }
  }
}
