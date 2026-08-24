-- AIWAKU V6.3 — Koreksi arsitektur WhatsApp routing (post-review)
-- Apply after 20260827_v61_registration_hardening.sql
--
-- LATAR BELAKANG PERUBAHAN:
-- Review menemukan 2 masalah desain di V60-V62:
-- 1) wa-webhook routing pakai `?tenant=<slug>` query param, padahal
--    skema sudah punya UNIQUE index di tenant_wa_config.phone_number_id
--    yang seharusnya jadi sumber kebenaran routing. Payload Meta SELALU
--    menyertakan metadata.phone_number_id, jadi query param itu
--    duplikasi yang tidak perlu dan rawan salah kalau tenant lupa
--    memasang query param dengan benar di App Dashboard mereka.
-- 2) `ORDER_TYPE_NICHES` hardcoded sebagai Set literal di edge function
--    (`resto`, `cafe`, `bakery`) — setiap nambah niche baru yang
--    "order-based", harus ingat update 2 tempat (DB constraint + Set
--    literal di kode Deno). Dipindah jadi kolom `tenants.flow_type`
--    supaya satu sumber kebenaran.
--
-- Migration ini TIDAK mengubah tenant_wa_config.webhook_verify_token
-- (kolom tetap ada, boleh dibiarkan kosong/tidak dipakai) — verifikasi
-- GET handshake sekarang pakai satu env var platform `WA_WEBHOOK_VERIFY_TOKEN`,
-- bukan token per-tenant. Alasan: verify_token cuma bukti kepemilikan
-- URL saat setup, bukan mekanisme keamanan pesan (itu tugas HMAC
-- signature per-tenant pakai app_secret).

-- ============================================================
-- 1) Kolom flow_type di tenants
-- ============================================================
alter table public.tenants add column if not exists flow_type text check (flow_type in ('order','booking'));

-- Backfill tenant yang sudah ada, berdasarkan niche. Niche "order-based"
-- (jual produk/barang, bukan booking slot/jadwal): resto, cafe, bakery.
-- Sisanya (booking-based) untuk semua niche lain.
update public.tenants set flow_type = case
  when niche in ('resto', 'cafe', 'bakery') then 'order'
  else 'booking'
end
where flow_type is null;

alter table public.tenants alter column flow_type set not null;
alter table public.tenants alter column flow_type set default 'booking';

-- ============================================================
-- 2) register_tenant_atomic: set flow_type otomatis saat tenant baru
--    dibuat, supaya tidak ada tenant baru yang lolos tanpa flow_type
--    (yang akan bikin wa-webhook nge-default ke 'booking' secara diam-diam
--    untuk niche yang seharusnya 'order').
-- ============================================================
create or replace function public.register_tenant_atomic(
  p_tenant_name text,
  p_slug text,
  p_niche text,
  p_owner_name text default null,
  p_wa_number text default null,
  p_features text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tenant_id uuid := gen_random_uuid();
  v_clean_slug text := lower(trim(p_slug));
  v_feature text;
  v_flow_type text;
begin
  if v_user is null then
    raise exception 'Unauthorized';
  end if;

  if p_tenant_name is null or trim(p_tenant_name) = '' then
    raise exception 'Nama usaha wajib diisi';
  end if;

  if v_clean_slug !~ '^[a-z0-9-]{3,50}$' then
    raise exception 'Slug harus 3-50 karakter, huruf kecil/angka/dash saja';
  end if;

  if exists (select 1 from tenants where slug = v_clean_slug) then
    raise exception 'Slug sudah dipakai, pilih yang lain';
  end if;

  if p_niche not in (
    'salon','barbershop','resto','gedung','futsal','padel','bakery',
    'car_wash','spa','klinik_kesehatan','klinik_kecantikan',
    'cafe','dental','hotel_villa','rental_kendaraan','laundry',
    'gym','pet_grooming','karaoke','event_organizer','wedding_organizer',
    'kursus','bengkel','travel_tour'
  ) then
    raise exception 'Jenis usaha tidak valid';
  end if;

  v_flow_type := case when p_niche in ('resto', 'cafe', 'bakery') then 'order' else 'booking' end;

  insert into tenants (id, slug, name, niche, owner_name, wa_number, is_active, plan, flow_type)
  values (v_tenant_id, v_clean_slug, trim(p_tenant_name), p_niche, p_owner_name, p_wa_number, true, 'basic', v_flow_type);

  insert into tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, v_user, 'owner');

  foreach v_feature in array coalesce(p_features, '{}')
  loop
    if exists (select 1 from feature_catalog where key = v_feature) then
      insert into tenant_features (tenant_id, feature_key, enabled)
      values (v_tenant_id, v_feature, true)
      on conflict (tenant_id, feature_key) do nothing;
    end if;
  end loop;

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_clean_slug);
end;
$$;
