// Tipe pesan yang SUDAH dinormalisasi dari format provider apapun
// (Meta Cloud API, Twilio, Qontak, dll). Flow engine hanya bicara lewat
// tipe ini, tidak pernah bicara langsung ke payload provider — supaya
// ganti provider = ganti adapter saja, flow engine tidak disentuh.

export interface NormalizedInboundMessage {
  tenantPhoneNumberId: string // dipakai buat lookup tenant_wa_config
  customerWa: string // nomor customer, format E.164 tanpa '+' (mis. 62812xxxxxxx)
  customerName?: string
  text?: string // isi pesan teks bebas
  buttonReplyId?: string // kalau customer tap tombol interactive
  listReplyId?: string // kalau customer pilih dari interactive list
  providerMessageId: string
  raw: unknown // payload asli provider, disimpan ke wa_messages.raw_payload buat audit/debug
}

export type OutboundMessage =
  | { kind: 'text'; text: string }
  | { kind: 'button_list'; text: string; buttons: { id: string; label: string }[] } // maks jumlah tombol beda per provider, adapter yang tanggung jawab validasi
  | { kind: 'interactive_list'; text: string; sections: { title: string; items: { id: string; label: string; description?: string }[] }[] }

export interface SendResult {
  providerMessageId: string
}

export interface TenantWaConfig {
  tenantId: string
  provider: string
  phoneNumberId: string
  webhookVerifyToken: string
  credentials: Record<string, unknown>
}
