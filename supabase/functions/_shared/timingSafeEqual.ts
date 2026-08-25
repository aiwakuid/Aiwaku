// Constant-time string compare untuk membandingkan secret/token (mis.
// header internal function-to-function, atau verify token lain yang
// BUKAN sudah berupa HMAC digest).
//
// AIWAKU V6.8: sebelumnya bot-create-payment membandingkan
// `x-aiwaku-internal-secret` pakai `!==` biasa. Perbandingan string
// JS berhenti di karakter pertama yang beda, jadi waktu eksekusinya
// bocor informasi seberapa banyak prefix yang cocok (timing attack).
// Ini pola yang sama yang sudah ditangani manual untuk HMAC signature
// di metaCloudAdapter.ts (lihat verifyWebhook) — helper ini
// menggeneralisasi pola yang sama supaya dipakai konsisten di semua
// tempat yang membandingkan secret, bukan cuma HMAC digest.
export function timingSafeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
