-- AIWAKU V6.6.1 — Reconciliation: kolom `orders` yang hilang di production
--
-- KONTEKS AUDIT (25 Agustus 2026):
-- Verifikasi terhadap katalog production live (information_schema.columns)
-- mengonfirmasi tabel public.orders TIDAK memiliki kolom `idempotency_key`
-- maupun `updated_at`.
--
-- Namun fungsi-fungsi berikut, yang sudah aktif di production (bukan draft),
-- membaca/menulis kedua kolom tersebut secara eksplisit:
--   - create_order_atomic       (10 parameter, service_role only, V65)
--       INSERT ... idempotency_key, ..., updated_at
--       SELECT ... WHERE o.idempotency_key = p_idempotency_key
--   - bot_create_order_atomic
--       SELECT / INSERT ... idempotency_key
--   - cancel_order_atomic
--       UPDATE orders SET ..., updated_at = now()
--   - bot_record_cash_payment
--       UPDATE orders SET ..., updated_at = now()
--
-- Fungsi-fungsi ini berhasil ter-CREATE tanpa error karena dump/definisi
-- database menjalankan `SET check_function_bodies = false`, sehingga
-- Postgres tidak memvalidasi body PL/pgSQL terhadap skema aktual pada saat
-- CREATE FUNCTION. Validasi baru terjadi saat fungsi benar-benar dipanggil
-- (runtime), yang akan gagal dengan error "column ... does not exist".
--
-- DAMPAK: pembuatan order baru (baik dari staff/dashboard maupun dari bot
-- WhatsApp) kemungkinan besar GAGAL TOTAL di production sampai migration
-- ini diterapkan. Pembatalan order (cancel_order_atomic) dan pencatatan
-- pembayaran cash via bot (bot_record_cash_payment) kemungkinan juga gagal.
--
-- PENTING SEBELUM APPLY:
-- 1) Konfirmasi ulang gejala ini di production (cek Supabase logs / error
--    rate pada create_order_atomic, cancel_order_atomic, dsb) untuk
--    memastikan ini benar penyebab kegagalan yang teramati, bukan sekadar
--    potensi masalah.
-- 2) Jalankan migration ini di lingkungan staging/branch dulu jika
--    memungkinkan sebelum apply ke production.
-- 3) Setelah apply, jalankan query verifikasi di bagian akhir file ini.
--
-- ============================================================
-- 1) Tambah kolom yang hilang.
-- idempotency_key: nullable, text. Boleh NULL karena tidak semua caller
-- mengirim idempotency key (mis. create_order_atomic dipanggil tanpa
-- p_idempotency_key dari beberapa jalur lama).
-- updated_at: default now() supaya baris lama otomatis terisi saat
-- kolom ditambahkan (Postgres 11+ mengisi nilai default untuk baris
-- existing dalam satu langkah, tanpa rewrite penuh tabel untuk kasus
-- constant default seperti ini).
-- ============================================================

alter table public.orders
  add column if not exists idempotency_key text;

alter table public.orders
  add column if not exists updated_at timestamp with time zone not null default now();

-- ============================================================
-- 2) Unique constraint untuk idempotency_key.
--
-- Logika create_order_atomic / bot_create_order_atomic saat ini adalah
-- "SELECT dulu, INSERT kalau tidak ketemu" -- pola ini punya race
-- condition kalau dua request dengan idempotency_key yang sama datang
-- nyaris bersamaan (keduanya bisa lolos SELECT sebelum salah satu
-- sempat INSERT). Unique index partial berikut menutup celah itu di
-- level database: percobaan INSERT kedua akan gagal dengan
-- unique_violation alih-alih membuat order duplikat.
--
-- Partial (WHERE idempotency_key IS NOT NULL) supaya order lama/baru
-- yang tidak mengirim idempotency_key tidak saling bentrok sebagai
-- "NULL = NULL" (lagipula unique index standar sudah memperlakukan
-- multiple NULL sebagai tidak bentrok, tapi predicate ini membuat
-- maksudnya eksplisit dan indexnya lebih kecil).
--
-- CATATAN: fungsi create_order_atomic/bot_create_order_atomic BELUM
-- menangani unique_violation ini (belum ada exception handler untuk
-- re-fetch order existing). Menutup index ini akan membuat request
-- kedua yang race gagal dengan error, bukan silently return order lama
-- seperti yang diharapkan idempotency. Ini adalah fail-safe yang lebih
-- aman daripada duplikat order, tapi sebaiknya function di-update juga
-- di migration terpisah untuk menangani exception ini dengan retry
-- SELECT. Dicatat sebagai follow-up, TIDAK di-fix di migration ini
-- (smallest safe change principle).
-- ============================================================

create unique index if not exists orders_tenant_idempotency_key_idx
  on public.orders using btree (tenant_id, idempotency_key)
  where idempotency_key is not null;

-- ============================================================
-- 3) Verifikasi cepat (jalankan manual setelah migration apply):
-- ============================================================

-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'orders'
-- and column_name in ('idempotency_key', 'updated_at')
-- order by column_name;
-- -- harus mengembalikan 2 baris.

-- select indexname, indexdef
-- from pg_indexes
-- where schemaname = 'public' and tablename = 'orders'
-- and indexname = 'orders_tenant_idempotency_key_idx';
-- -- harus mengembalikan 1 baris.

-- -- Smoke test manual (opsional, hati-hati di production):
-- -- panggil create_order_atomic dua kali dengan p_idempotency_key yang
-- -- sama dan pastikan panggilan kedua tidak membuat order baru.
