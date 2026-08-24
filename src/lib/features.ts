import type { FeatureKey, Niche } from '../types'

// Sumber kebenaran daftar niche & fitur ada di database (tabel
// `tenants_niche_check` constraint & `feature_catalog`, migration
// 20260824_v58_registration_niche_features.sql). File ini adalah
// salinan sisi client untuk render UI wizard registrasi — kalau
// nambah niche/fitur baru, migration DAN file ini harus diupdate
// bareng, jangan cuma salah satu.
//
// CATATAN 'lainnya' (migration v66): kalau user pilih niche ini di wizard
// registrasi, UI WAJIB nampilin input teks tambahan buat nama jenis usaha
// sendiri, dan nilainya dikirim sebagai p_niche_label ke register_tenant_atomic
// (atau field `niche_label` di metadata registrasi kalau lewat flow
// complete_registration_from_metadata). RPC akan menolak (raise exception)
// kalau niche = 'lainnya' tapi label kosong — belum ada perubahan di halaman
// registrasi untuk field ini, itu next step terpisah dari migration ini.

export const NICHE_CATALOG: { key: Niche; label: string; emoji: string }[] = [
  { key: 'resto', label: 'Resto', emoji: '🍜' },
  { key: 'cafe', label: 'Cafe', emoji: '☕' },
  { key: 'bakery', label: 'Bakery / Kue', emoji: '🎂' },
  { key: 'salon', label: 'Salon', emoji: '💇' },
  { key: 'barbershop', label: 'Barbershop', emoji: '💈' },
  { key: 'spa', label: 'Spa', emoji: '🧖' },
  { key: 'klinik_kecantikan', label: 'Klinik Kecantikan', emoji: '✨' },
  { key: 'klinik_kesehatan', label: 'Klinik Kesehatan', emoji: '🩺' },
  { key: 'dental', label: 'Dental', emoji: '🦷' },
  { key: 'hotel_villa', label: 'Hotel / Villa', emoji: '🏨' },
  { key: 'padel', label: 'Padel', emoji: '🎾' },
  { key: 'futsal', label: 'Futsal', emoji: '⚽' },
  { key: 'gym', label: 'Gym / Studio Fitness', emoji: '🏋️' },
  { key: 'rental_kendaraan', label: 'Rental Kendaraan', emoji: '🚗' },
  { key: 'car_wash', label: 'Car Wash / Detailing', emoji: '🧼' },
  { key: 'bengkel', label: 'Bengkel', emoji: '🛠️' },
  { key: 'laundry', label: 'Laundry', emoji: '🧺' },
  { key: 'pet_grooming', label: 'Pet Grooming', emoji: '🐕' },
  { key: 'karaoke', label: 'Karaoke', emoji: '🎤' },
  { key: 'event_organizer', label: 'Event Organizer', emoji: '🎉' },
  { key: 'wedding_organizer', label: 'Wedding Organizer', emoji: '💍' },
  { key: 'kursus', label: 'Kursus / Bimbel', emoji: '📚' },
  { key: 'travel_tour', label: 'Travel / Tour', emoji: '🧳' },
  { key: 'gedung', label: 'Sewa Gedung / Ruangan', emoji: '🏢' },
  { key: 'lainnya', label: 'Lainnya', emoji: '✏️' },
]

// is_available: false = placeholder, belum ada halaman (lihat catatan
// di migration). Tetap ditampilkan di wizard tapi diberi label "Segera
// hadir" dan tidak akan ngefek ke apapun kalau dipilih.
export const FEATURE_CATALOG: { key: FeatureKey; label: string; description: string; is_available: boolean }[] = [
  { key: 'inventory', label: 'Persediaan', description: 'Kelola stok bahan baku & resep', is_available: true },
  { key: 'kds', label: 'Kitchen Display', description: 'Layar dapur untuk status pesanan', is_available: true },
  { key: 'tables', label: 'Meja', description: 'Manajemen meja untuk dine-in', is_available: true },
  { key: 'booking', label: 'Booking / Reservasi', description: 'Booking slot lapangan, ruangan, atau jadwal layanan', is_available: true },
  { key: 'queue', label: 'Antrian', description: 'Manajemen antrian pelanggan', is_available: false },
  { key: 'customers', label: 'Pelanggan', description: 'Database pelanggan & riwayat transaksi', is_available: true },
  { key: 'reports', label: 'Laporan Bisnis', description: 'Ringkasan penjualan & performa bisnis', is_available: true },
  { key: 'calendar', label: 'Kalender', description: 'Sinkronisasi jadwal ke Google Calendar', is_available: true },
  { key: 'catalog', label: 'Katalog Online', description: 'Halaman katalog produk untuk dibagikan ke pelanggan', is_available: true },
]

// Rekomendasi default per niche — cuma buat prefill checklist di wizard,
// user tetap bisa ubah sebelum submit. Tidak ditegakkan di backend.
export const NICHE_FEATURE_DEFAULTS: Record<Niche, FeatureKey[]> = {
  resto: ['inventory', 'kds', 'tables', 'customers', 'reports', 'catalog'],
  cafe: ['inventory', 'kds', 'tables', 'customers', 'reports', 'catalog'],
  bakery: ['inventory', 'customers', 'reports', 'catalog'],
  salon: ['booking', 'queue', 'customers', 'reports', 'catalog'],
  barbershop: ['booking', 'queue', 'customers', 'reports'],
  spa: ['booking', 'queue', 'customers', 'reports', 'catalog'],
  klinik_kecantikan: ['booking', 'queue', 'customers', 'reports'],
  klinik_kesehatan: ['booking', 'queue', 'customers', 'reports'],
  dental: ['booking', 'queue', 'customers', 'reports'],
  hotel_villa: ['booking', 'customers', 'reports', 'calendar'],
  padel: ['booking', 'customers', 'reports', 'calendar'],
  futsal: ['booking', 'customers', 'reports', 'calendar'],
  gym: ['booking', 'customers', 'reports'],
  rental_kendaraan: ['booking', 'customers', 'reports'],
  car_wash: ['booking', 'queue', 'customers', 'reports'],
  bengkel: ['booking', 'queue', 'customers', 'reports'],
  laundry: ['customers', 'reports'],
  pet_grooming: ['booking', 'queue', 'customers', 'reports'],
  karaoke: ['booking', 'customers', 'reports'],
  event_organizer: ['booking', 'customers', 'reports', 'calendar'],
  wedding_organizer: ['booking', 'customers', 'reports', 'calendar'],
  kursus: ['booking', 'customers', 'reports', 'calendar'],
  travel_tour: ['booking', 'customers', 'reports', 'calendar'],
  gedung: ['booking', 'customers', 'reports', 'calendar'],
  // 'lainnya': flow_type default 'order' (lihat niche_flow_catalog di migration
  // v66), jadi default fitur ikut pola niche 'order' paling minimal — tenant
  // tetap bebas ubah sebelum submit seperti niche lain.
  lainnya: ['customers', 'reports', 'catalog'],
}

// Pemetaan feature key -> path segment yang di-gate di App.tsx/Sidebar.
// Route yang tidak ada di sini (mis. /pos, /menu, /, /settings) selalu
// terbuka untuk semua tenant (core feature).
export const FEATURE_ROUTE_MAP: Partial<Record<FeatureKey, string>> = {
  inventory: 'inventory',
  kds: 'kds',
  tables: 'tables',
  booking: 'bookings',
  customers: 'customers',
  reports: 'reports',
  calendar: 'calendar',
  catalog: 'catalog',
  // 'queue' sengaja tidak dipetakan — belum ada route.
}
