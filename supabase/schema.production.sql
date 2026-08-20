-- AIWAKU V5 PRODUCTION SECURITY FOUNDATION
-- IMPORTANT: requires Supabase Auth and tenant_members populated before enabling admin writes.
-- This file intentionally does NOT alter the existing demo schema.sql automatically.

create table if not exists tenant_members (
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'staff' check (role in ('owner','admin','staff')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index if not exists tenant_members_user_idx on tenant_members(user_id);
-- Google integration secrets: never expose OAuth tokens to anon/authenticated clients.
create table if not exists tenant_secrets (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  google_access_token text,
  google_refresh_token text,
  google_token_expires_at timestamptz,
  sheets_spreadsheet_id text,
  updated_at timestamptz not null default now()
);
alter table tenant_secrets enable row level security;
revoke all on table tenant_secrets from anon, authenticated;


create or replace function public.is_tenant_member(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = target_tenant and tm.user_id = auth.uid()
  );
$$;

create or replace function public.is_tenant_admin(target_tenant uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.tenant_members tm
    where tm.tenant_id = target_tenant
      and tm.user_id = auth.uid()
      and tm.role in ('owner','admin')
  );
$$;

-- Remove insecure demo policies before enabling production policies.
-- This migration is safe to run after schema.sql.

-- Remove legacy permissive policies from schema.sql.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT schemaname, tablename, policyname FROM pg_policies
           WHERE schemaname='public' AND policyname='Allow all for MVP'
  LOOP
    EXECUTE format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

-- Tenant discovery is intentionally public only for active tenant slug/name; all tenant data remains membership protected.
alter table tenants enable row level security;
drop policy if exists tenants_public_discovery on tenants;
create policy tenants_public_discovery on tenants for select to anon, authenticated
  using (is_active = true);

alter table tenant_members enable row level security;
alter table menus enable row level security;
alter table orders enable row level security;
alter table bookings enable row level security;
alter table chats enable row level security;
alter table promos enable row level security;
alter table customers enable row level security;
alter table payments enable row level security;
alter table audit_logs enable row level security;

drop policy if exists tenant_members_self_read on tenant_members;
create policy tenant_members_self_read on tenant_members
  for select to authenticated using (user_id = auth.uid());

drop policy if exists menus_member_read on menus;
create policy menus_member_read on menus
  for select to authenticated using (is_tenant_member(tenant_id));
drop policy if exists menus_admin_write on menus;
create policy menus_admin_write on menus
  for all to authenticated using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));

drop policy if exists orders_member_read on orders;
create policy orders_member_read on orders
  for select to authenticated using (is_tenant_member(tenant_id));
drop policy if exists orders_admin_write on orders;
create policy orders_admin_write on orders
  for all to authenticated using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));

drop policy if exists bookings_member_read on bookings;
create policy bookings_member_read on bookings
  for select to authenticated using (is_tenant_member(tenant_id));
drop policy if exists bookings_staff_write on bookings;
create policy bookings_staff_write on bookings
  for insert to authenticated with check (is_tenant_member(tenant_id));
drop policy if exists bookings_staff_update on bookings;
create policy bookings_staff_update on bookings
  for update to authenticated using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists chats_member on chats;
create policy chats_member on chats
  for all to authenticated using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists promos_admin on promos;
create policy promos_admin on promos
  for all to authenticated using (is_tenant_admin(tenant_id)) with check (is_tenant_admin(tenant_id));

drop policy if exists customers_member on customers;
create policy customers_member on customers
  for all to authenticated using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));

drop policy if exists payments_member_read on payments;
create policy payments_member_read on payments
  for select to authenticated using (is_tenant_member(tenant_id));
drop policy if exists payments_server_write on payments;
create policy payments_server_write on payments
  for insert to service_role with check (true);
drop policy if exists payments_server_update on payments;
create policy payments_server_update on payments
  for update to service_role using (true) with check (true);

drop policy if exists audit_member_read on audit_logs;
create policy audit_member_read on audit_logs
  for select to authenticated using (is_tenant_member(tenant_id));
drop policy if exists audit_server_insert on audit_logs;
create policy audit_server_insert on audit_logs
  for insert to service_role with check (true);

-- Phase 6 schema alignment for fields used by production code.
alter table menus add column if not exists updated_at timestamptz not null default now();
alter table orders add column if not exists updated_at timestamptz not null default now();
alter table orders add column if not exists idempotency_key text;
alter table bookings add column if not exists updated_at timestamptz not null default now();

-- Prevent negative monetary/stock values at database level.
alter table menus drop constraint if exists menus_price_nonnegative;
alter table menus add constraint menus_price_nonnegative check (price >= 0);
alter table menus drop constraint if exists menus_stock_nonnegative;
alter table menus add constraint menus_stock_nonnegative check (stock >= 0);
alter table orders drop constraint if exists orders_money_nonnegative;
alter table orders add constraint orders_money_nonnegative check (
  subtotal >= 0 and discount >= 0 and tax >= 0 and total >= 0 and dp >= 0 and remaining >= 0
);
alter table payments drop constraint if exists payments_amount_positive;
alter table payments add constraint payments_amount_positive check (amount > 0);

create unique index if not exists payments_provider_order_unique
  on payments(provider, provider_order_id)
  where provider_order_id is not null;

-- Booking uniqueness: one tenant/field/date/start may only exist once.
create unique index if not exists bookings_slot_unique
  on bookings(tenant_id, date, field_no, start_time)
  where status <> 'batal';


-- ============================================================
-- PHASE 3: ATOMIC ORDER CREATION + STOCK RESERVATION
-- ============================================================

create extension if not exists pgcrypto;

-- Canonical persisted order item schema: menu_id/name/qty/price/subtotal.
update orders
set items = (
  select jsonb_agg(jsonb_build_object(
    'menu_id', coalesce(value->>'menu_id', value->>'menuId'),
    'name', value->>'name',
    'qty', floor(coalesce((value->>'qty')::numeric, (value->>'quantity')::numeric, 0)),
    'price', floor(coalesce((value->>'price')::numeric, 0)),
    'subtotal', floor(coalesce((value->>'subtotal')::numeric, (value->>'price')::numeric, 0)) * floor(coalesce((value->>'qty')::numeric, (value->>'quantity')::numeric, 0))
  )) from jsonb_array_elements(items)
)
where items is not null;

alter table orders drop constraint if exists orders_status_check;
alter table orders add constraint orders_status_check check (status in ('pending','dp','lunas','batal','baking','ready','delivered'));



create or replace function public.create_order_atomic(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_wa text,
  p_items jsonb,
  p_discount integer default 0,
  p_tax integer default 0,
  p_pickup_time timestamptz default null,
  p_custom_text text default null,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_item jsonb;
  v_menu record;
  v_qty integer;
  v_subtotal bigint := 0;
  v_discount bigint := greatest(0, p_discount);
  v_tax bigint := greatest(0, p_tax);
  v_total bigint;
  v_order_id uuid := gen_random_uuid();
  v_invoice text;
  v_existing jsonb;
  v_normalized jsonb := '[]'::jsonb;
begin
  if v_user is null then
    raise exception 'Unauthorized';
  end if;

  if not exists (
    select 1 from tenant_members
    where tenant_id = p_tenant_id and user_id = v_user
  ) then
    raise exception 'Forbidden';
  end if;

  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order kosong';
  end if;

  -- Idempotency: if caller retries the same request, return the original order.
  if p_idempotency_key is not null then
    select to_jsonb(o) into v_existing
    from orders o
    where o.tenant_id = p_tenant_id
      and o.idempotency_key = p_idempotency_key
    limit 1;

    if v_existing is not null then
      return v_existing;
    end if;
  end if;

  -- Lock all requested menu rows in a stable order.
  for v_item in
    select value
    from jsonb_array_elements(p_items)
    order by coalesce(value->>'menu_id', value->>'menuId')
  loop
    v_qty := floor(coalesce((v_item->>'qty')::numeric, 0));
    if v_qty <= 0 then raise exception 'Quantity tidak valid'; end if;

    select id, name, price, stock, is_active
      into v_menu
    from menus
    where id = (v_item->>'menu_id')::uuid
      and tenant_id = p_tenant_id
    for update;

    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if not v_menu.is_active then raise exception 'Produk tidak aktif: %', v_menu.name; end if;
    if v_menu.stock < v_qty then raise exception 'Stok % tidak cukup', v_menu.name; end if;

    v_subtotal := v_subtotal + (v_menu.price::bigint * v_qty);
    v_normalized := v_normalized || jsonb_build_array(jsonb_build_object(
      'menu_id', v_menu.id,
      'name', v_menu.name,
      'price', v_menu.price,
      'qty', v_qty,
      'subtotal', v_menu.price::bigint * v_qty
    ));

    update menus
    set stock = stock - v_qty,
        updated_at = now(),
        is_active = case when stock - v_qty <= 0 then false else is_active end
    where id = v_menu.id and tenant_id = p_tenant_id;
  end loop;

  v_discount := least(v_discount, v_subtotal);
  v_total := greatest(0, v_subtotal - v_discount + v_tax);

  if v_total <= 0 then raise exception 'Total order tidak valid'; end if;

  v_invoice := 'INV-' ||
    to_char(now() at time zone 'Asia/Jakarta', 'YYYYMMDD') ||
    '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));

  insert into orders (
    id, tenant_id, invoice_no, customer_name, customer_wa, items,
    subtotal, discount, tax, total, dp, remaining, status, fulfillment_status,
    idempotency_key, pickup_time, custom_text, created_at, updated_at
  )
  values (
    v_order_id, p_tenant_id, v_invoice,
    trim(coalesce(p_customer_name, '')),
    trim(coalesce(p_customer_wa, '')),
    v_normalized, v_subtotal, v_discount, v_tax, v_total,
    0, v_total, 'pending', 'new', p_idempotency_key, p_pickup_time, p_custom_text, now(), now()
  );

  return (
    select to_jsonb(o) from orders o where o.id = v_order_id
  );
exception
  when unique_violation then
    if p_idempotency_key is not null then
      select to_jsonb(o) into v_existing
      from orders o
      where o.tenant_id = p_tenant_id
        and o.idempotency_key = p_idempotency_key
      limit 1;
      if v_existing is not null then return v_existing; end if;
    end if;
    raise;
end;
$$;

revoke all on function public.create_order_atomic(uuid,text,text,jsonb,integer,integer,timestamptz,text,text) from public;
grant execute on function public.create_order_atomic(uuid,text,text,jsonb,integer,integer,timestamptz,text,text) to authenticated;

create unique index if not exists orders_tenant_idempotency_unique
  on orders(tenant_id, idempotency_key)
  where idempotency_key is not null;

-- Server-side order creation must execute under the authenticated user's identity,
-- while the function itself is SECURITY DEFINER and validates tenant membership.


-- ============================================================
-- PHASE 4: ORDER STATE MACHINE + STOCK RESTORATION
-- ============================================================

create or replace function public.cancel_order_atomic(
  p_order_id uuid,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order record;
  v_item jsonb;
  v_qty integer;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;

  select * into v_order
  from orders
  where id = p_order_id
  for update;

  if not found then raise exception 'Order tidak ditemukan'; end if;

  if not exists (
    select 1 from tenant_members
    where tenant_id = v_order.tenant_id and user_id = v_user
  ) then
    raise exception 'Forbidden';
  end if;

  if v_order.status in ('batal', 'cancelled', 'lunas') then
    return to_jsonb(v_order);
  end if;

  -- Restore stock exactly once because status is changed under the same row lock.
  for v_item in select value from jsonb_array_elements(v_order.items)
  loop
    v_qty := floor(coalesce((v_item->>'qty')::numeric, 0));
    if v_qty > 0 then
      update menus
      set stock = stock + v_qty,
          updated_at = now()
      where id = (v_item->>'menu_id')::uuid
        and tenant_id = v_order.tenant_id;
    end if;
  end loop;

  update orders
  set status = 'batal',
      remaining = 0,
      updated_at = now()
  where id = p_order_id;

  insert into audit_logs (
    tenant_id, action, entity, entity_id, old_value, new_value, "user", timestamp
  ) values (
    v_order.tenant_id, 'order.cancel', 'order', p_order_id::text,
    jsonb_build_object('status', v_order.status),
    jsonb_build_object('status', 'batal', 'reason', p_reason),
    v_user::text, now()
  );

  select * into v_order from orders where id = p_order_id;
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.cancel_order_atomic(uuid,text) from public;
grant execute on function public.cancel_order_atomic(uuid,text) to authenticated;

-- Only the RPC should mutate order cancellation from the client.


-- ============================================================
-- PHASE 4: PAYMENT STATE CONSISTENCY
-- ============================================================

create or replace function public.mark_payment_paid(
  p_payment_id uuid,
  p_provider_order_id text,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment record;
  v_order record;
begin
  select * into v_payment
  from payments
  where id = p_payment_id
    and provider_order_id = p_provider_order_id
  for update;

  if not found then raise exception 'Payment tidak ditemukan'; end if;
  if v_payment.status = 'paid' then return to_jsonb(v_payment); end if;
  if v_payment.amount <> p_amount then raise exception 'Nominal payment tidak cocok'; end if;

  update payments
  set status = 'paid', paid_at = now()
  where id = v_payment.id;

  if v_payment.order_id is not null then
    select * into v_order from orders where id = v_payment.order_id for update;
    if found then
      update orders
      set dp = least(total, coalesce(dp,0) + v_payment.amount),
          remaining = greatest(0, total - least(total, coalesce(dp,0) + v_payment.amount)),
          status = case
            when greatest(0, total - least(total, coalesce(dp,0) + v_payment.amount)) = 0 then 'lunas'
            else status
          end,
          updated_at = now()
      where id = v_order.id;
    end if;
  end if;

  return (select to_jsonb(p) from payments p where p.id = v_payment.id);
end;
$$;

revoke all on function public.mark_payment_paid(uuid,text,bigint) from public;
grant execute on function public.mark_payment_paid(uuid,text,bigint) to service_role;


-- ============================================================
-- PHASE 6: SERVER-SIDE ADMIN MUTATIONS
-- ============================================================

create or replace function public.admin_upsert_menu(p_menu jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_tenant uuid;
begin
  v_id := nullif(p_menu->>'id','')::uuid;
  v_tenant := (p_menu->>'tenant_id')::uuid;
  if not is_tenant_admin(v_tenant) then raise exception 'Forbidden'; end if;
  insert into menus(id,tenant_id,name,price,stock,is_active,description,emoji,custom_fields,niche,image_url,created_at,updated_at)
  values(coalesce(v_id,gen_random_uuid()),v_tenant,trim(p_menu->>'name'),greatest(0,(p_menu->>'price')::int),greatest(0,(p_menu->>'stock')::int),coalesce((p_menu->>'is_active')::boolean,true),p_menu->>'description',coalesce(p_menu->>'emoji','📦'),coalesce(p_menu->'custom_fields','{}'::jsonb),p_menu->>'niche',p_menu->>'image_url',coalesce((p_menu->>'created_at')::timestamptz,now()),now())
  on conflict(id) do update set name=excluded.name,price=excluded.price,stock=excluded.stock,is_active=excluded.is_active,description=excluded.description,emoji=excluded.emoji,custom_fields=excluded.custom_fields,niche=excluded.niche,image_url=excluded.image_url
  returning id into v_id;
  return (select to_jsonb(m) from menus m where m.id=v_id);
end $$;
revoke all on function public.admin_upsert_menu(jsonb) from public;
grant execute on function public.admin_upsert_menu(jsonb) to authenticated;

create or replace function public.admin_upsert_customer(p_customer jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_tenant uuid;
begin
  v_id := nullif(p_customer->>'id','')::uuid;
  v_tenant := (p_customer->>'tenant_id')::uuid;
  if not is_tenant_member(v_tenant) then raise exception 'Forbidden'; end if;
  insert into customers(id,tenant_id,name,wa,email,notes,total_orders,total_spent,last_order_at,tags,created_at)
  values(coalesce(v_id,gen_random_uuid()),v_tenant,trim(p_customer->>'name'),trim(p_customer->>'wa'),p_customer->>'email',p_customer->>'notes',coalesce((p_customer->>'total_orders')::int,0),coalesce((p_customer->>'total_spent')::int,0),nullif(p_customer->>'last_order_at','')::timestamptz,coalesce(array(select jsonb_array_elements_text(coalesce(p_customer->'tags','[]'::jsonb))), '{}'),coalesce((p_customer->>'created_at')::timestamptz,now()))
  on conflict(id) do update set name=excluded.name,wa=excluded.wa,email=excluded.email,notes=excluded.notes,total_orders=excluded.total_orders,total_spent=excluded.total_spent,last_order_at=excluded.last_order_at,tags=excluded.tags
  returning id into v_id;
  return (select to_jsonb(c) from customers c where c.id=v_id);
end $$;
revoke all on function public.admin_upsert_customer(jsonb) from public;
grant execute on function public.admin_upsert_customer(jsonb) to authenticated;

create or replace function public.book_slot_atomic(p_booking jsonb)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_tenant uuid; v_id uuid; v_result bookings;
begin
  v_tenant := (p_booking->>'tenant_id')::uuid;
  v_id := nullif(p_booking->>'id','')::uuid;
  if not is_tenant_member(v_tenant) then raise exception 'Forbidden'; end if;
  if exists(select 1 from bookings where tenant_id=v_tenant and date=(p_booking->>'date')::date and field_no=p_booking->>'field_no' and start_time=(p_booking->>'start_time')::time and status <> 'batal' and id <> coalesce(v_id,'00000000-0000-0000-0000-000000000000'::uuid)) then raise exception 'Slot sudah dipesan'; end if;
  insert into bookings(id,tenant_id,date,start_time,end_time,field_no,customer_name,customer_wa,status,price,customer_id,order_id)
  values(coalesce(v_id,gen_random_uuid()),v_tenant,(p_booking->>'date')::date,(p_booking->>'start_time')::time,(p_booking->>'end_time')::time,p_booking->>'field_no',p_booking->>'customer_name',p_booking->>'customer_wa','booked',coalesce((p_booking->>'price')::int,0),nullif(p_booking->>'customer_id','')::uuid,nullif(p_booking->>'order_id','')::uuid)
  on conflict(id) do update set customer_name=excluded.customer_name,customer_wa=excluded.customer_wa,status='booked',price=excluded.price
  returning * into v_result;
  return to_jsonb(v_result);
end $$;
revoke all on function public.book_slot_atomic(jsonb) from public;
grant execute on function public.book_slot_atomic(jsonb) to authenticated;

create or replace function public.cancel_booking_atomic(p_booking_id uuid)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_row bookings;
begin
  select * into v_row from bookings where id=p_booking_id for update;
  if not found then raise exception 'Booking tidak ditemukan'; end if;
  if not is_tenant_member(v_row.tenant_id) then raise exception 'Forbidden'; end if;
  update bookings set status='batal' where id=p_booking_id;
  select * into v_row from bookings where id=p_booking_id;
  return to_jsonb(v_row);
end $$;
revoke all on function public.cancel_booking_atomic(uuid) from public;
grant execute on function public.cancel_booking_atomic(uuid) to authenticated;

create or replace function public.write_audit_log(p_tenant_id uuid,p_action text,p_entity text,p_entity_id text,p_old_value jsonb default null,p_new_value jsonb default null)
returns jsonb language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not is_tenant_member(p_tenant_id) then raise exception 'Forbidden'; end if;
  insert into audit_logs(tenant_id,action,entity,entity_id,old_value,new_value,"user",timestamp)
  values(p_tenant_id,p_action,p_entity,p_entity_id,p_old_value,p_new_value,auth.uid()::text,now()) returning id into v_id;
  return jsonb_build_object('id',v_id);
end $$;
revoke all on function public.write_audit_log(uuid,text,text,text,jsonb,jsonb) from public;
grant execute on function public.write_audit_log(uuid,text,text,text,jsonb,jsonb) to authenticated;


-- ============================================================
-- V5.4: CASH PAYMENT + PAYMENT UX
-- ============================================================
create or replace function public.record_cash_payment(
  p_order_id uuid,
  p_amount bigint
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
begin
  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if not is_tenant_member(v_order.tenant_id) then raise exception 'Forbidden'; end if;
  v_amount := greatest(0, least(coalesce(v_order.remaining, v_order.total), p_amount));
  if v_amount <= 0 then raise exception 'Nominal pembayaran tidak valid'; end if;

  insert into payments(tenant_id, order_id, provider, provider_order_id, amount, status, paid_at, created_at)
  values (v_order.tenant_id, v_order.id, 'manual', 'CASH-' || v_order.id::text || '-' || extract(epoch from clock_timestamp())::bigint, v_amount, 'paid', now(), now())
  returning * into v_payment;

  update orders
  set dp = least(total, coalesce(dp,0) + v_amount),
      remaining = greatest(0, total - least(total, coalesce(dp,0) + v_amount)),
      status = case when greatest(0, total - least(total, coalesce(dp,0) + v_amount)) = 0 then 'lunas' else 'dp' end,
      updated_at = now()
  where id = v_order.id;

  return jsonb_build_object('payment', to_jsonb(v_payment), 'order', (select to_jsonb(o) from orders o where o.id=v_order.id));
end;
$$;
revoke all on function public.record_cash_payment(uuid,bigint) from public;
grant execute on function public.record_cash_payment(uuid,bigint) to authenticated;

-- ============================================================
-- V5.5: KITCHEN DISPLAY SYSTEM (FULFILLMENT STATE)
-- Payment state and kitchen state are intentionally separated.
-- An order can be PAID while still being NEW/PREPARING in kitchen.
-- ============================================================
alter table orders add column if not exists fulfillment_status text not null default 'new';

alter table orders drop constraint if exists orders_fulfillment_status_check;
alter table orders add constraint orders_fulfillment_status_check
  check (fulfillment_status in ('new','preparing','ready','served','cancelled'));

update orders
set fulfillment_status = case
  when status = 'baking' then 'preparing'
  when status = 'ready' then 'ready'
  when status = 'delivered' then 'served'
  when status = 'batal' then 'cancelled'
  else 'new'
end
where fulfillment_status = 'new';

create index if not exists orders_tenant_fulfillment_idx
  on orders(tenant_id, fulfillment_status, created_at);

create or replace function public.kitchen_update_order_status(
  p_order_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_order record;
  v_from text;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if p_status not in ('new','preparing','ready','served','cancelled') then
    raise exception 'Status kitchen tidak valid';
  end if;

  select * into v_order from orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if not is_tenant_member(v_order.tenant_id) then raise exception 'Forbidden'; end if;

  v_from := v_order.fulfillment_status;

  if v_from = p_status then
    return to_jsonb(v_order);
  end if;

  if v_from = 'cancelled' or v_from = 'served' then
    raise exception 'Pesanan sudah selesai';
  end if;

  if p_status = 'preparing' and v_from <> 'new' then
    raise exception 'Pesanan harus baru sebelum diproses';
  end if;
  if p_status = 'ready' and v_from <> 'preparing' then
    raise exception 'Pesanan harus sedang diproses';
  end if;
  if p_status = 'served' and v_from <> 'ready' then
    raise exception 'Pesanan harus siap sebelum disajikan';
  end if;
  if p_status = 'cancelled' and v_from = 'served' then
    raise exception 'Pesanan sudah disajikan';
  end if;

  update orders
  set fulfillment_status = p_status,
      updated_at = now()
  where id = p_order_id;

  insert into audit_logs(tenant_id, action, entity, entity_id, old_value, new_value, "user", timestamp)
  values(
    v_order.tenant_id, 'order.kitchen_status', 'order', p_order_id::text,
    jsonb_build_object('fulfillment_status', v_from),
    jsonb_build_object('fulfillment_status', p_status),
    v_user::text, now()
  );

  select * into v_order from orders where id = p_order_id;
  return to_jsonb(v_order);
end;
$$;

revoke all on function public.kitchen_update_order_status(uuid,text) from public;
grant execute on function public.kitchen_update_order_status(uuid,text) to authenticated;

