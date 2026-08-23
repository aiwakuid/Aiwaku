-- AIWAKU V5.9 — Ekspansi katalog niche (kurasi 20 bisnis WA-heavy)
-- Apply after 20260824_v58_registration_niche_features.sql
--
-- KEPUTUSAN PRODUK: niche lama (bakery, padel, futsal, gedung) TETAP
-- dipertahankan meskipun tidak masuk daftar kurasi 20 ini — dicek dulu
-- ke src/lib/storage.ts dan ternyata dipakai di demo/seed data. Migration
-- ini murni ADDITIVE (menambah pilihan), tidak menghapus apapun.
--
-- 'resto' lama tetap dipertahankan sebagai alias; 'cafe' ditambah sebagai
-- niche terpisah karena user secara eksplisit membedakan Resto vs Cafe
-- (meski secara teknis alur order-nya sama, label bisnisnya beda).

alter table public.tenants drop constraint if exists tenants_niche_check;
alter table public.tenants add constraint tenants_niche_check
  check (niche in (
    -- niche lama (dipertahankan, dipakai demo data)
    'salon','barbershop','resto','gedung','futsal','padel','bakery',
    'car_wash','spa','klinik_kesehatan','klinik_kecantikan',
    -- 20 niche kurasi baru
    'cafe','dental','hotel_villa','rental_kendaraan','laundry',
    'gym','pet_grooming','karaoke','event_organizer','wedding_organizer',
    'kursus','bengkel','travel_tour'
  ));

-- register_tenant_atomic (20260824) hardcode daftar niche buat validasi
-- pesan error yang jelas ke user. Sinkronkan ke daftar terbaru di atas,
-- jangan biarkan drift antara constraint tabel dan validasi RPC.
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

  insert into tenants (id, slug, name, niche, owner_name, wa_number, is_active, plan)
  values (v_tenant_id, v_clean_slug, trim(p_tenant_name), p_niche, p_owner_name, p_wa_number, true, 'basic');

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
