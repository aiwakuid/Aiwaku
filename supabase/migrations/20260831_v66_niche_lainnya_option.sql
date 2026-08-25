-- AIWAKU V6.6 — Opsi niche "Lainnya" (Other)
-- Apply after 20260830_v65_revoke_anon_rpc_access.sql
--
-- KEPUTUSAN PRODUK: alih-alih membuka `niche` jadi free-text penuh (yang
-- akan memutus link ke niche_flow_catalog dan memaksa tenant memilih
-- flow_type manual), kita tetap pakai closed catalog TAPI tambah satu
-- entri escape-hatch: 'lainnya'. Tenant dengan jenis usaha di luar 24
-- niche kurasi tetap bisa daftar hari itu juga (flow_type default
-- 'order', paling aman/umum), sambil nulis nama bisnisnya sendiri di
-- `tenants.niche_label` buat ditampilkan di UI. Kalau pola tertentu
-- muncul berkali-kali di label ini, itu jadi sinyal buat naikkan jadi
-- niche resmi baru (pola yang sama seperti v58/v59/v64), bukan alasan
-- buat buka niche jadi bebas.

-- ============================================================
-- 1) Kolom niche_label — hanya dipakai kalau niche = 'lainnya'.
--    Nullable, karena niche kurasi lainnya tidak butuh ini.
-- ============================================================
alter table public.tenants add column if not exists niche_label text;

alter table public.tenants drop constraint if exists tenants_niche_label_required_for_lainnya;
alter table public.tenants add constraint tenants_niche_label_required_for_lainnya
  check (niche <> 'lainnya' or (niche_label is not null and trim(niche_label) <> ''));

-- ============================================================
-- 2) Widen niche check constraint — tambah 'lainnya' ke daftar yang ada.
-- ============================================================
alter table public.tenants drop constraint if exists tenants_niche_check;
alter table public.tenants add constraint tenants_niche_check
  check (niche in (
    'salon','barbershop','resto','gedung','futsal','padel','bakery',
    'car_wash','spa','klinik_kesehatan','klinik_kecantikan',
    'cafe','dental','hotel_villa','rental_kendaraan','laundry',
    'gym','pet_grooming','karaoke','event_organizer','wedding_organizer',
    'kursus','bengkel','travel_tour',
    'lainnya'
  ));

-- ============================================================
-- 3) Daftarkan 'lainnya' di niche_flow_catalog — flow default 'order'
--    karena itu alur paling umum & paling aman kalau jenis usahanya
--    belum diketahui sistem.
-- ============================================================
insert into public.niche_flow_catalog (niche, flow_type) values
  ('lainnya','order')
on conflict (niche) do update set flow_type = excluded.flow_type;

-- ============================================================
-- 4) register_tenant_atomic — tambah parameter opsional p_niche_label.
--    Wajib diisi (non-kosong) kalau p_niche = 'lainnya', divalidasi di
--    level RPC supaya pesan error jelas (constraint di #1 tetap jadi
--    jaring pengaman terakhir di level DB).
--    Signature berubah (parameter baru) -> drop dulu overload lama
--    sebelum create, supaya tidak ada dua overload nyangkut sekaligus.
-- ============================================================
drop function if exists public.register_tenant_atomic(text,text,text,text,text,text[]);

create or replace function public.register_tenant_atomic(
  p_tenant_name text,
  p_slug text,
  p_niche text,
  p_owner_name text default null,
  p_wa_number text default null,
  p_features text[] default '{}',
  p_niche_label text default null
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
  v_niche_label text;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if p_tenant_name is null or trim(p_tenant_name) = '' then raise exception 'Nama usaha wajib diisi'; end if;
  if v_clean_slug !~ '^[a-z0-9-]{3,50}$' then raise exception 'Slug harus 3-50 karakter, huruf kecil/angka/dash saja'; end if;
  if exists (select 1 from tenants where slug = v_clean_slug) then raise exception 'Slug sudah dipakai, pilih yang lain'; end if;

  select flow_type into v_flow_type from niche_flow_catalog
  where niche = p_niche and enabled = true;
  if v_flow_type is null then raise exception 'Jenis usaha belum memiliki business flow'; end if;

  if p_niche = 'lainnya' then
    if p_niche_label is null or trim(p_niche_label) = '' then
      raise exception 'Nama jenis usaha wajib diisi untuk kategori Lainnya';
    end if;
    v_niche_label := trim(p_niche_label);
  else
    v_niche_label := null;
  end if;

  insert into tenants (id, slug, name, niche, niche_label, owner_name, wa_number, is_active, plan, flow_type)
  values (v_tenant_id, v_clean_slug, trim(p_tenant_name), p_niche, v_niche_label, p_owner_name, p_wa_number, true, 'basic', v_flow_type);

  insert into tenant_members (tenant_id, user_id, role) values (v_tenant_id, v_user, 'owner');

  foreach v_feature in array coalesce(p_features, '{}') loop
    if exists (select 1 from feature_catalog where key = v_feature) then
      insert into tenant_features (tenant_id, feature_key, enabled)
      values (v_tenant_id, v_feature, true)
      on conflict (tenant_id, feature_key) do nothing;
    end if;
  end loop;

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_clean_slug, 'flow_type', v_flow_type, 'niche_label', v_niche_label);
end;
$$;

revoke all on function public.register_tenant_atomic(text,text,text,text,text,text[],text) from public, anon;
grant execute on function public.register_tenant_atomic(text,text,text,text,text,text[],text) to authenticated;

-- ============================================================
-- 5) complete_registration_from_metadata — dipanggil pada login pertama
--    setelah email confirmation (lihat v61). Ikut oper niche_label dari
--    metadata registrasi supaya alur "Lainnya" tetap jalan lewat path ini,
--    bukan cuma lewat pemanggilan langsung register_tenant_atomic.
-- ============================================================
create or replace function public.complete_registration_from_metadata()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_meta jsonb;
  v_tenant_id uuid;
  v_features text[];
  v_owner_name text;
  v_wa_number text;
  v_niche_label text;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Unauthorized';
  end if;

  select tm.tenant_id into v_tenant_id
  from public.tenant_members tm
  where tm.user_id = v_user
  order by tm.created_at asc
  limit 1;

  if v_tenant_id is not null then
    select jsonb_build_object('tenant_id', t.id, 'slug', t.slug)
      into v_result
    from public.tenants t where t.id = v_tenant_id;
    return v_result;
  end if;

  select raw_user_meta_data -> 'aiwaku_registration'
    into v_meta
  from auth.users
  where id = v_user;

  if v_meta is null or jsonb_typeof(v_meta) <> 'object' then
    return null;
  end if;

  if trim(coalesce(v_meta->>'business_name','')) = ''
     or trim(coalesce(v_meta->>'slug','')) = ''
     or trim(coalesce(v_meta->>'niche','')) = '' then
    raise exception 'Data pendaftaran tidak lengkap';
  end if;

  v_features := array(
    select jsonb_array_elements_text(coalesce(v_meta->'features','[]'::jsonb))
  );
  v_owner_name := nullif(trim(coalesce(v_meta->>'owner_name','')), '');
  v_wa_number := nullif(trim(coalesce(v_meta->>'wa_number','')), '');
  v_niche_label := nullif(trim(coalesce(v_meta->>'niche_label','')), '');

  v_result := public.register_tenant_atomic(
    v_meta->>'business_name',
    v_meta->>'slug',
    v_meta->>'niche',
    v_owner_name,
    v_wa_number,
    v_features,
    v_niche_label
  );

  return v_result;
end;
$$;

revoke all on function public.complete_registration_from_metadata() from public, anon;
grant execute on function public.complete_registration_from_metadata() to authenticated;
