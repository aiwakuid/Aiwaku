// Shared CORS handling for AIWAKU edge functions.
//
// AIWAKU_V5.7 FASE 2 #11: sebelumnya semua function pakai
// 'Access-Control-Allow-Origin': '*'. Sekarang origin diverifikasi terhadap
// allowlist yang dikonfigurasi lewat env var ALLOWED_ORIGINS (comma-separated),
// misalnya:
//   ALLOWED_ORIGINS=https://app.aiwaku.id,https://rujak.aiwaku.id
//
// Set env var ini di setiap environment (staging & production) sebelum deploy.
// Kalau belum di-set sama sekali, function fallback ke '*' supaya tidak
// memblokir development lokal — TAPI ini harus diisi sebelum go-live.
export function buildCorsHeaders(req: Request): Record<string, string> {
  const configured = (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)

  const origin = req.headers.get('Origin') || req.headers.get('origin')

  let allowOrigin = '*'
  if (configured.length > 0) {
    if (origin && configured.includes(origin)) {
      allowOrigin = origin
    } else if (!origin) {
      // Non-browser caller (server-to-server, curl) tanpa header Origin.
      allowOrigin = configured[0]
    } else {
      // Origin hadir tapi tidak ada di allowlist -> jangan izinkan.
      allowOrigin = 'null'
    }
  }

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}
