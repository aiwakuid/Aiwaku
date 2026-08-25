-- AIWAKU V6.8 — Tutup lubang RLS di niche_flow_catalog + cegah regresi
-- serupa di tabel baru ke depan.
--
-- TEMUAN AUDIT:
-- niche_flow_catalog dibuat di migration v58
-- (20260824001500_v58_registration_niche_features.sql) TANPA
-- `alter table ... enable row level security` dan TANPA satu pun
-- `create policy`. Karena Supabase punya
-- `alter default privileges ... grant all on tables to anon, authenticated`
-- di schema bootstrap, tabel ini otomatis dapat GRANT ALL (bukan cuma
-- SELECT — termasuk INSERT/UPDATE/DELETE) ke role `anon` DAN
-- `authenticated`, tanpa RLS yang menyaring baris sama sekali.
--
-- Dampak: siapa pun yang pegang anon key publik (selalu terekspos di
-- frontend) bisa INSERT/UPDATE/DELETE langsung ke niche_flow_catalog
-- tanpa autentikasi. Tabel ini dibaca oleh register_tenant_atomic
-- (SECURITY DEFINER, function v58) untuk resolve flow_type saat
-- registrasi tenant baru — jadi bisa disalahgunakan untuk:
--   a) DoS: set enabled=false di semua baris -> registrasi tenant baru
--      gagal semua (register_tenant_atomic akan tidak menemukan flow_type).
--   b) Racun data: insert/update baris niche->flow_type yang salah,
--      supaya tenant baru ke-assign flow_type yang keliru (mis. tenant
--      niche "salon" di-assign flow_type "order" alih-alih "booking").
--
-- Dikonfirmasi lewat grep: tidak ada satu pun query frontend
-- (`src/`) atau edge function (`supabase/functions/`) yang SELECT
-- langsung dari niche_flow_catalog — daftar niche di UI registrasi
-- (`src/pages/Register.tsx`) di-hardcode di frontend, bukan
-- DB-driven. Satu-satunya pembaca tabel ini adalah
-- register_tenant_atomic, yang SECURITY DEFINER dan owned by
-- `postgres`, sehingga otomatis bypass RLS (table owner tidak kena
-- RLS kecuali FORCE ROW LEVEL SECURITY diset — tidak dipakai di sini,
-- konsisten dengan tabel lain di schema ini).
--
-- Jadi fix paling aman & minimal: enable RLS TANPA policy apa pun
-- untuk anon/authenticated. Default RLS adalah deny-all kalau tidak
-- ada policy yang match, sehingga SELECT/INSERT/UPDATE/DELETE dari
-- anon & authenticated langsung ditutup total, sementara
-- register_tenant_atomic (jalan sebagai owner) tetap bisa baca
-- normal. Kalau nanti ada kebutuhan UI baca niche_flow_catalog
-- langsung, tambahkan policy SELECT read-only secara eksplisit di
-- migration terpisah — jangan biarkan menganggur tanpa RLS lagi.

alter table public.niche_flow_catalog enable row level security;

-- Defense-in-depth: cabut juga grant level-tabel dari anon/authenticated.
-- RLS saja sudah cukup (deny-all tanpa policy), tapi mencabut grant
-- eksplisit membuat niatnya jelas dibaca ulang nanti dan tidak
-- bergantung semata pada RLS tidak pernah salah konfigurasi.
revoke all on table public.niche_flow_catalog from anon, authenticated;

-- ============================================================
-- Cegah regresi: tabel BARU ke depan tidak lagi otomatis dapat
-- INSERT/UPDATE/DELETE dari anon/authenticated hanya karena dibuat di
-- schema public. Ini mengikuti pola yang sudah diterapkan untuk
-- FUNCTION di 20260830_v65_revoke_anon_rpc_access.sql (case #17 di
-- audit yang sama: hanya function yang dibenahi, tabel belum).
--
-- SELECT tetap dibiarkan default (kebanyakan tabel di sini memang
-- butuh SELECT dari authenticated, disaring oleh RLS policy
-- per-tabel) — yang dicabut cuma privilege tulis yang paling sering
-- lupa "harus eksplisit di-guard oleh RLS", karena SELECT-tanpa-RLS
-- biasanya ketahuan cepat (data bocor kelihatan), sedangkan
-- WRITE-tanpa-RLS baru ketahuan setelah data sudah dirusak.
--
-- Tabel yang memang butuh insert/update/delete langsung dari
-- anon/authenticated (kalau ada) HARUS di-grant eksplisit di
-- migration yang membuat tabel itu — jangan mengandalkan default lagi.
-- ============================================================

alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from anon;

alter default privileges in schema public
  revoke insert, update, delete, truncate on tables from authenticated;

-- ============================================================
-- Verifikasi cepat (bukan bagian dari migration, jalankan manual
-- setelah apply). HARUS mengembalikan 0 baris:
-- ============================================================
-- select table_name, string_agg(distinct privilege_type, ', ') as anon_priv
-- from information_schema.role_table_grants
-- where grantee = 'anon'
--   and table_schema = 'public'
--   and table_name = 'niche_flow_catalog'
-- group by table_name;
