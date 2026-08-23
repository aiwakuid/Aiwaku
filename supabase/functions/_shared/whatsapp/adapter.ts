import type { NormalizedInboundMessage, OutboundMessage, SendResult, TenantWaConfig } from './types.ts'

// Kontrak yang wajib dipenuhi setiap provider (Meta Cloud API, Twilio,
// Qontak, dll). BELUM ADA implementasi konkret di file ini — ini murni
// interface supaya arsitektur wa-webhook/flow engine bisa didesain dan
// direview SEKARANG, sebelum provider dipilih.
//
// Begitu provider diputuskan, buat file baru mis. `metaCloudAdapter.ts`
// yang implement interface ini, TANPA mengubah flowEngine.ts atau
// wa-webhook/index.ts sama sekali.
export interface WhatsAppProviderAdapter {
  // Verifikasi signature pesan (BUKAN verifikasi handshake GET — itu
  // sekarang pakai satu shared platform secret, lihat wa-webhook/index.ts).
  // Terima rawBody sebagai string (bukan Request) supaya tidak perlu
  // baca body dua kali (sekali buat verify, sekali buat parse JSON).
  verifyWebhook(rawBody: string, signatureHeader: string | null, config: TenantWaConfig): Promise<boolean>

  // Ubah payload mentah provider jadi NormalizedInboundMessage. Return
  // null kalau payload bukan pesan customer (mis. delivery receipt,
  // status update) — wa-webhook harus ack 200 tapi tidak proses lebih
  // lanjut.
  parseInbound(rawBody: unknown): NormalizedInboundMessage | null

  // Ekstrak phone_number_id dari payload mentah TANPA butuh config tenant
  // apapun — dipakai wa-webhook untuk tahu tenant mana SEBELUM config
  // ter-load (ayam-telur: butuh tahu tenant dulu baru bisa verify
  // signature pakai app_secret tenant itu).
  extractPhoneNumberId(rawBody: unknown): string | null

  // Kirim balasan ke customer. Provider yang beda punya limit berbeda
  // (mis. jumlah tombol interactive) — adapter yang tanggung jawab
  // menyesuaikan/menolak, bukan flow engine.
  sendMessage(config: TenantWaConfig, customerWa: string, message: OutboundMessage): Promise<SendResult>
}

// STUB — dipakai untuk testing flow engine end-to-end TANPA provider
// asli (mis. unit test, atau simulasi manual dari admin dashboard).
// JANGAN dipakai di production — sendMessage di sini tidak benar-benar
// mengirim apapun.
export class NullAdapter implements WhatsAppProviderAdapter {
  async verifyWebhook(): Promise<boolean> { return true }
  parseInbound(rawBody: unknown): NormalizedInboundMessage | null {
    return rawBody as NormalizedInboundMessage
  }
  extractPhoneNumberId(): string | null { return null }
  async sendMessage(_config: TenantWaConfig, _customerWa: string, message: OutboundMessage): Promise<SendResult> {
    console.log('[NullAdapter] would send:', message)
    return { providerMessageId: `stub-${crypto.randomUUID()}` }
  }
}
