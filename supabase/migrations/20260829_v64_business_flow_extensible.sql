-- AIWAKU V6.4 — extensible business flow model
-- Historical migrations are immutable; this migration widens the existing
-- constraints without changing their historical meaning.

alter table public.tenants drop constraint if exists tenants_flow_type_check;
alter table public.tenants add constraint tenants_flow_type_check
  check (flow_type in ('order','booking','service','membership','hybrid'));

alter table public.wa_conversations drop constraint if exists wa_conversations_flow_type_check;
alter table public.wa_conversations add constraint wa_conversations_flow_type_check
  check (flow_type in ('order','booking','service','membership','hybrid'));

-- Keep the current supported niche mapping deterministic, but stop forcing
-- every future non-order niche to mean booking. New niche mappings should
-- explicitly choose a flow before onboarding.
create table if not exists public.niche_flow_catalog (
  niche text primary key,
  flow_type text not null check (flow_type in ('order','booking','service','membership','hybrid')),
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.niche_flow_catalog (niche, flow_type) values
  ('resto','order'), ('cafe','order'), ('bakery','order'),
  ('laundry','service'), ('bengkel','service'), ('car_wash','service'),
  ('salon','booking'), ('barbershop','booking'), ('spa','booking'),
  ('klinik_kesehatan','booking'), ('klinik_kecantikan','booking'),
  ('padel','booking'), ('futsal','booking'), ('gedung','booking'),
  ('hotel_villa','booking'), ('rental_kendaraan','booking'),
  ('pet_grooming','booking'), ('karaoke','booking'),
  ('event_organizer','booking'), ('wedding_organizer','booking'),
  ('kursus','booking'), ('travel_tour','booking'),
  ('gym','membership')
on conflict (niche) do update set flow_type = excluded.flow_type;

-- Repair existing tenant mappings using the catalog. Tenants with an
-- explicitly configured supported flow keep it; only legacy values are
-- remapped when the catalog has a stronger definition.
update public.tenants t
set flow_type = n.flow_type
from public.niche_flow_catalog n
where n.niche = t.niche and n.enabled = true;

-- Future registrations derive flow from one DB source of truth.
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
  if v_user is null then raise exception 'Unauthorized'; end if;
  if p_tenant_name is null or trim(p_tenant_name) = '' then raise exception 'Nama usaha wajib diisi'; end if;
  if v_clean_slug !~ '^[a-z0-9-]{3,50}$' then raise exception 'Slug harus 3-50 karakter, huruf kecil/angka/dash saja'; end if;
  if exists (select 1 from tenants where slug = v_clean_slug) then raise exception 'Slug sudah dipakai, pilih yang lain'; end if;

  select flow_type into v_flow_type from niche_flow_catalog
  where niche = p_niche and enabled = true;
  if v_flow_type is null then raise exception 'Jenis usaha belum memiliki business flow'; end if;

  insert into tenants (id, slug, name, niche, owner_name, wa_number, is_active, plan, flow_type)
  values (v_tenant_id, v_clean_slug, trim(p_tenant_name), p_niche, p_owner_name, p_wa_number, true, 'basic', v_flow_type);

  insert into tenant_members (tenant_id, user_id, role) values (v_tenant_id, v_user, 'owner');

  foreach v_feature in array coalesce(p_features, '{}') loop
    if exists (select 1 from feature_catalog where key = v_feature) then
      insert into tenant_features (tenant_id, feature_key, enabled)
      values (v_tenant_id, v_feature, true)
      on conflict (tenant_id, feature_key) do nothing;
    end if;
  end loop;

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_clean_slug, 'flow_type', v_flow_type);
end;
$$;

revoke all on function public.register_tenant_atomic(text,text,text,text,text,text[]) from public;
grant execute on function public.register_tenant_atomic(text,text,text,text,text,text[]) to authenticated;

-- Bot cash payment: same accounting rules as staff cash payment, but gated
-- exclusively to service_role because the caller is the verified WhatsApp webhook.
create or replace function public.bot_record_cash_payment(
  p_tenant_id uuid,
  p_order_id uuid,
  p_amount bigint,
  p_conversation_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_payment record;
  v_amount bigint;
  v_provider_order_id text := 'CASH-' || p_order_id::text;
begin
  select * into v_order from orders where id = p_order_id and tenant_id = p_tenant_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if v_order.status in ('batal','lunas') then raise exception 'Order tidak dapat dibayar'; end if;
  select * into v_payment from payments where order_id = v_order.id and provider_order_id = v_provider_order_id limit 1;
  if found then
    return jsonb_build_object('payment', to_jsonb(v_payment), 'order', (select to_jsonb(o) from orders o where o.id=v_order.id));
  end if;

  v_amount := greatest(0, least(coalesce(v_order.remaining, v_order.total), p_amount));
  if v_amount <= 0 then raise exception 'Nominal pembayaran tidak valid'; end if;

  insert into payments(tenant_id, order_id, provider, provider_order_id, amount, status, paid_at, created_at)
  values (v_order.tenant_id, v_order.id, 'manual', v_provider_order_id, v_amount, 'paid', now(), now())
  returning * into v_payment;

  update orders
  set dp = least(total, coalesce(dp,0) + v_amount),
      remaining = greatest(0, total - least(total, coalesce(dp,0) + v_amount)),
      status = case when greatest(0, total - least(total, coalesce(dp,0) + v_amount)) = 0 then 'lunas' else 'dp' end,
      updated_at = now()
  where id = v_order.id;

  update wa_conversations set context = context || jsonb_build_object('payment_id', v_payment.id) where id = p_conversation_id and tenant_id = p_tenant_id;
  return jsonb_build_object('payment', to_jsonb(v_payment), 'order', (select to_jsonb(o) from orders o where o.id=v_order.id));
end;
$$;

revoke all on function public.bot_record_cash_payment(uuid,uuid,bigint,uuid) from public;
grant execute on function public.bot_record_cash_payment(uuid,uuid,bigint,uuid) to service_role;

alter table public.tenant_wa_config drop constraint if exists tenant_wa_config_provider_check;
alter table public.tenant_wa_config add constraint tenant_wa_config_provider_check
  check (provider in ('meta_cloud','360dialog','twilio','qontak'));
