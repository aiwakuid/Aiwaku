-- AIWAKU V6.7 — Durable WhatsApp Inbox (DRAFT — BELUM UNTUK DIAPPLY)
--
-- STATUS: DRAFT RECONCILIATION, disusun berdasarkan
-- docs/production/SUPABASE_SCHEMA_SNAPSHOT_2026-08-25.sql (kolom
-- wa_messages/wa_conversations) yang SUDAH dikonfirmasi lewat file, TAPI
-- BELUM diverifikasi ulang lewat query katalog live (information_schema /
-- pg_indexes / pg_proc) seperti yang dilakukan untuk kolom `orders` di
-- V6.6. Kolom `orders.idempotency_key` & `orders.updated_at` terbukti
-- hilang di production padahal ada di ekspektasi kode -- jadi jangan
-- asumsikan snapshot file 100% sinkron dengan production tanpa recheck.
--
-- SEBELUM APPLY, jalankan dulu (sesuai Bagian 12 handoff):
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='wa_messages'
--   order by ordinal_position;
--
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_schema='public' and table_name='wa_conversations'
--   order by ordinal_position;
--
--   select indexname, indexdef from pg_indexes
--   where schemaname='public' and tablename in ('wa_messages','wa_conversations','orders');
--
-- Bandingkan hasilnya dengan asumsi di bawah. Kalau ada beda, migration
-- ini WAJIB disesuaikan dulu sebelum apply.
--
-- ASUMSI SKEMA SAAT INI (dari snapshot, belum live-verified):
--   wa_messages: id, conversation_id, tenant_id, direction, message_type,
--                body, provider_message_id, raw_payload, created_at
--   wa_conversations: id, tenant_id, customer_wa, customer_id, flow_type,
--                current_step, context, status, last_message_at, created_at
--   orders: (lihat V6.6 -- tidak ada wa_conversation_id)
--
-- GAP YANG DITUTUP (Audit 10 / SUPABASE_AUDIT_LOG):
--   [ ] UNIQUE (tenant_id, provider_message_id)  -- anti duplikat inbound
--   [ ] processing_status / processing_started_at (lease) /
--       processing_attempts / processing_error / processed_at
--   [ ] orders.wa_conversation_id
--   [ ] claim / finish / retry RPC untuk worker pemroses pesan masuk

-- ============================================================
-- 1) wa_messages -- kolom durable processing state.
--
-- Discussion scope: processing state HANYA relevan untuk pesan INBOUND
-- (pesan dari customer yang perlu diproses bot). Pesan OUTBOUND (dikirim
-- tenant/bot) tidak butuh antrian pemrosesan, jadi di-backfill langsung
-- sebagai 'done' supaya tidak nyangkut di worker queue.
-- ============================================================

alter table public.wa_messages
  add column if not exists processing_status text not null default 'pending',
  add column if not exists processing_started_at timestamp with time zone,
  add column if not exists processing_attempts integer not null default 0,
  add column if not exists processing_error text,
  add column if not exists processed_at timestamp with time zone;

alter table public.wa_messages
  add constraint wa_messages_processing_status_check
  check (processing_status = any (array['pending','processing','done','failed']));

-- Backfill: pesan outbound existing dianggap tidak perlu diproses.
update public.wa_messages
set processing_status = 'done',
    processed_at = created_at
where direction = 'outbound'
  and processing_status = 'pending';

-- ============================================================
-- 2) Unique constraint anti-duplikat provider_message_id.
--
-- Partial (WHERE provider_message_id IS NOT NULL) karena tidak semua
-- baris punya provider_message_id (mis. pesan lama sebelum field ini
-- dipakai, atau outbound message tertentu). Scope per tenant supaya
-- ID dari provider berbeda tenant tidak saling bentrok.
-- ============================================================

create unique index if not exists wa_messages_tenant_provider_msg_idx
  on public.wa_messages using btree (tenant_id, provider_message_id)
  where provider_message_id is not null;

-- Index bantu untuk worker mengambil antrian pending secara efisien.
create index if not exists wa_messages_processing_queue_idx
  on public.wa_messages using btree (tenant_id, processing_status, created_at)
  where direction = 'inbound';

-- ============================================================
-- 3) orders.wa_conversation_id -- korelasi eksplisit order <-> conversation.
--
-- Saat ini korelasi hanya lewat wa_conversations.context (jsonb, diisi
-- manual oleh bot_create_order_atomic/bot_record_cash_payment). Kolom
-- relasional ini melengkapi (bukan menggantikan) mekanisme itu, supaya
-- query "order mana yang berasal dari percakapan WA ini" tidak perlu
-- parse jsonb.
-- ============================================================

alter table public.orders
  add column if not exists wa_conversation_id uuid
  references public.wa_conversations(id) on delete set null;

create index if not exists orders_wa_conversation_idx
  on public.orders using btree (wa_conversation_id)
  where wa_conversation_id is not null;

-- CATATAN: migration ini TIDAK mengubah bot_create_order_atomic untuk
-- otomatis mengisi wa_conversation_id saat INSERT. Itu perubahan function
-- terpisah (function code, bukan schema), sengaja tidak digabung di sini
-- mengikuti prinsip smallest safe change. Perlu migration/PR susulan:
--   insert into orders (..., wa_conversation_id) values (..., p_conversation_id);
-- pada bot_create_order_atomic.

-- ============================================================
-- 4) Claim / finish / retry RPC untuk worker pemroses pesan inbound.
--
-- Pola: worker memanggil claim_wa_message_atomic() untuk mengambil dan
-- "mengunci" satu pesan pending (atau pesan processing yang lease-nya
-- sudah kedaluwarsa -- menangani kasus worker crash tanpa finish/retry).
-- Setelah selesai, worker memanggil finish (sukses) atau retry (gagal,
-- akan dicoba lagi sampai batas p_max_attempts) atau fail permanen
-- setelah batas attempts tercapai.
-- ============================================================

create or replace function public.claim_wa_message_atomic(
  p_message_id uuid,
  p_lease_seconds integer default 60
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_row public.wa_messages;
begin
  select *
  into v_row
  from public.wa_messages
  where id = p_message_id
  for update;

  if not found then
    raise exception 'Pesan tidak ditemukan';
  end if;

  if v_row.processing_status = 'done' then
    return to_jsonb(v_row);
  end if;

  if v_row.processing_status = 'processing'
     and v_row.processing_started_at is not null
     and v_row.processing_started_at > now() - make_interval(secs => p_lease_seconds) then
    -- Masih dipegang worker lain, lease belum kedaluwarsa.
    raise exception 'Pesan sedang diproses worker lain';
  end if;

  update public.wa_messages
  set processing_status = 'processing',
      processing_started_at = now(),
      processing_attempts = processing_attempts + 1,
      processing_error = null
  where id = p_message_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

alter function public.claim_wa_message_atomic(uuid, integer) owner to postgres;

create or replace function public.finish_wa_message_atomic(
  p_message_id uuid
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_row public.wa_messages;
begin
  update public.wa_messages
  set processing_status = 'done',
      processed_at = now(),
      processing_error = null
  where id = p_message_id
  returning * into v_row;

  if not found then
    raise exception 'Pesan tidak ditemukan';
  end if;

  return to_jsonb(v_row);
end;
$$;

alter function public.finish_wa_message_atomic(uuid) owner to postgres;

create or replace function public.retry_wa_message_atomic(
  p_message_id uuid,
  p_error text,
  p_max_attempts integer default 5
) returns jsonb
language plpgsql security definer
set search_path to 'public'
as $$
declare
  v_row public.wa_messages;
begin
  select * into v_row from public.wa_messages where id = p_message_id for update;

  if not found then
    raise exception 'Pesan tidak ditemukan';
  end if;

  update public.wa_messages
  set processing_status = case
        when v_row.processing_attempts >= p_max_attempts then 'failed'
        else 'pending'
      end,
      processing_error = p_error,
      processing_started_at = null
  where id = p_message_id
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

alter function public.retry_wa_message_atomic(uuid, text, integer) owner to postgres;

-- ============================================================
-- 5) RPC security -- mengikuti pola V65: hanya service_role.
-- Worker pemroses pesan berjalan di edge function / background job,
-- bukan dipanggil langsung dari client authenticated/anon.
-- ============================================================

revoke all on function public.claim_wa_message_atomic(uuid, integer)
  from public, anon, authenticated;
grant execute on function public.claim_wa_message_atomic(uuid, integer)
  to service_role;

revoke all on function public.finish_wa_message_atomic(uuid)
  from public, anon, authenticated;
grant execute on function public.finish_wa_message_atomic(uuid)
  to service_role;

revoke all on function public.retry_wa_message_atomic(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.retry_wa_message_atomic(uuid, text, integer)
  to service_role;

-- ============================================================
-- 6) Verifikasi (jalankan manual setelah apply):
-- ============================================================

-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='wa_messages'
-- and column_name like 'processing_%' or column_name = 'processed_at';
-- -- harus 5 baris.

-- select indexname from pg_indexes
-- where schemaname='public' and tablename='wa_messages'
-- and indexname in ('wa_messages_tenant_provider_msg_idx','wa_messages_processing_queue_idx');
-- -- harus 2 baris.

-- select column_name from information_schema.columns
-- where table_schema='public' and table_name='orders' and column_name='wa_conversation_id';
-- -- harus 1 baris.

-- select p.proname, string_agg(grantee, ', ') as anon_masih_ada
-- from information_schema.role_routine_grants g
-- join pg_proc p on p.proname = g.routine_name
-- join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
-- where g.grantee = 'anon'
-- and p.proname in ('claim_wa_message_atomic','finish_wa_message_atomic','retry_wa_message_atomic')
-- group by p.proname;
-- -- harus kosong.
