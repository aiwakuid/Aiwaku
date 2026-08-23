-- AIWAKU V6.1 — Registration completion + legacy feature backfill
-- Apply after 20260826_v60_whatsapp_conversation_foundation.sql.
--
-- Keputusan produk:
-- 1) Email confirmation tetap boleh aktif. Draft registrasi disimpan di
--    auth user metadata dan provisioning tenant dilanjutkan otomatis pada
--    login pertama setelah konfirmasi.
-- 2) Tenant lama tidak boleh kehilangan akses ketika FeatureRouteGuard
--    diaktifkan. Feature default di-backfill sesuai niche lama/baru.

insert into public.tenant_features (tenant_id, feature_key, enabled)
select t.id, f.key, true
from public.tenants t
join public.feature_catalog f on f.is_available = true
where
  (t.niche in ('resto','cafe') and f.key in ('inventory','kds','tables','customers','reports','catalog'))
  or (t.niche = 'bakery' and f.key in ('inventory','customers','reports','catalog'))
  or (t.niche in ('salon','spa','klinik_kecantikan','klinik_kesehatan','dental') and f.key in ('booking','customers','reports'))
  or (t.niche = 'barbershop' and f.key in ('booking','customers','reports'))
  or (t.niche in ('hotel_villa','padel','futsal','event_organizer','wedding_organizer','kursus','travel_tour','gedung') and f.key in ('booking','customers','reports','calendar'))
  or (t.niche = 'gym' and f.key in ('booking','customers','reports'))
  or (t.niche in ('rental_kendaraan','karaoke') and f.key in ('booking','customers','reports'))
  or (t.niche in ('car_wash','bengkel','pet_grooming') and f.key in ('booking','customers','reports'))
  or (t.niche = 'laundry' and f.key in ('customers','reports'))
on conflict (tenant_id, feature_key) do nothing;

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

  v_result := public.register_tenant_atomic(
    v_meta->>'business_name',
    v_meta->>'slug',
    v_meta->>'niche',
    v_owner_name,
    v_wa_number,
    v_features
  );

  return v_result;
end;
$$;

revoke all on function public.complete_registration_from_metadata() from public;
grant execute on function public.complete_registration_from_metadata() to authenticated;
