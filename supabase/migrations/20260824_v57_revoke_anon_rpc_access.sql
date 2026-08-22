-- AIWAKU V5.7 — Fase 3 Fix
-- Ditemukan lewat audit pg_proc/role_routine_grants: hampir semua function
-- public punya grant EXECUTE ke role `anon`, padahal migration sebelumnya
-- hanya `revoke ... from public` / `from authenticated`. Ini karena Supabase
-- secara default punya ALTER DEFAULT PRIVILEGES yang otomatis grant EXECUTE
-- ke anon+authenticated+service_role setiap function baru dibuat — terpisah
-- dari role `public`, jadi `revoke ... from public` tidak menyentuhnya.
--
-- Migration ini:
-- 1) Drop overload LAMA create_order_atomic (9 parameter, bergantung
--    auth.uid(), sudah digantikan versi 10 parameter dengan p_user_id).
-- 2) Revoke EXECUTE dari `anon` secara eksplisit untuk semua RPC yang
--    seharusnya cuma bisa dipanggil user yang sudah login (authenticated)
--    atau cuma dari edge function (service_role).
-- 3) Set ALTER DEFAULT PRIVILEGES supaya function BARU ke depan tidak lagi
--    otomatis ke-grant ke anon (mencegah regresi yang sama).
--
-- Apply after 20260823_v57_payment_race_ratelimit_and_orderfix.sql.

-- ============================================================
-- 1) Drop overload lama create_order_atomic (9 parameter).
--    Konfirmasi dulu tidak ada pemanggil lain sebelum drop:
--    grep -rn "create_order_atomic" src supabase/functions
--    -> hanya ada 1 pemanggil (create-order/index.ts), sudah pakai versi
--    10 parameter (dengan p_user_id).
-- ============================================================

drop function if exists public.create_order_atomic(
  uuid, text, text, jsonb, integer, integer, timestamptz, text, text
);

-- Pastikan versi yang dipakai sekarang (10 parameter) HANYA bisa dipanggil
-- service_role — bukan authenticated/anon, karena p_user_id dipercaya begitu
-- saja dari parameter, bukan dari auth.uid() milik caller. Kalau authenticated
-- atau anon punya EXECUTE, siapapun bisa oper p_user_id sembarang orang.
revoke all on function public.create_order_atomic(
  uuid, text, text, jsonb, integer, integer, timestamptz, text, text, uuid
) from public, anon, authenticated;
grant execute on function public.create_order_atomic(
  uuid, text, text, jsonb, integer, integer, timestamptz, text, text, uuid
) to service_role;

-- ============================================================
-- 2) RPC yang cuma boleh dipanggil edge function (service_role saja).
--    Alasan tiap function: identitas/otorisasi sudah divalidasi TERPISAH
--    oleh edge function (verifikasi JWT + cek membership) sebelum RPC
--    dipanggil — RPC sendiri tidak divalidasi ulang lewat auth.uid().
-- ============================================================

revoke all on function public.check_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, text, integer, integer)
  to service_role;

revoke all on function public.reserve_pending_payment_atomic(uuid, uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.reserve_pending_payment_atomic(uuid, uuid, bigint)
  to service_role;

revoke all on function public.attach_midtrans_details_atomic(uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.attach_midtrans_details_atomic(uuid, text, text, text, text)
  to service_role;

revoke all on function public.mark_payment_paid(uuid, text, bigint)
  from public, anon, authenticated;
grant execute on function public.mark_payment_paid(uuid, text, bigint)
  to service_role;

-- ============================================================
-- 3) RPC yang dipanggil langsung dari frontend oleh user yang sudah login
--    (staff/admin tenant) — cabut anon, tetap authenticated.
-- ============================================================

revoke execute on function public.admin_upsert_customer(jsonb) from anon;
revoke execute on function public.admin_upsert_menu(jsonb) from anon;
revoke execute on function public.book_slot_atomic(jsonb) from anon;
revoke execute on function public.cancel_booking_atomic(uuid) from anon;
revoke execute on function public.cancel_order_atomic(uuid, text) from anon;
revoke execute on function public.record_cash_payment(uuid, bigint) from anon;
revoke execute on function public.write_audit_log(uuid, text, text, text, jsonb, jsonb) from anon;

-- ============================================================
-- 4) Cegah regresi: function baru ke depan tidak otomatis ke-grant ke anon.
--    (authenticated & service_role tetap dapat default seperti biasa;
--    kalau function baru butuh anon, harus di-grant eksplisit di migration
--    yang membuatnya — jangan biarkan ke-inherit diam-diam.)
-- ============================================================

alter default privileges in schema public
  revoke execute on functions from anon;

-- ============================================================
-- 5) Verifikasi cepat: query ini HARUS kosong setelah migration ini jalan.
--    (bukan bagian dari migration, tinggal dijalankan manual setelahnya)
-- ============================================================
-- select p.proname, string_agg(grantee, ', ') as anon_masih_ada
-- from information_schema.role_routine_grants g
-- join pg_proc p on p.proname = g.routine_name
-- join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
-- where g.grantee = 'anon'
--   and g.routine_name not in ('is_tenant_member', 'is_tenant_admin')
-- group by p.proname;
