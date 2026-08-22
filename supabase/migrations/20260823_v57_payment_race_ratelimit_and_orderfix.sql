-- AIWAKU V5.7 — Fase 2
-- (9)  Race condition create-payment: atomic reserve-before-Midtrans + DB-level uniqueness.
-- (10) Rate limiting sederhana untuk create-order & create-payment.
-- (13) Fix create_order_atomic: bergantung ke auth.uid() padahal dipanggil edge function
--      lewat service-role client -> auth.uid() null -> selalu 'Unauthorized' di production.
-- Apply after 20260822_v57_security_hardening.sql.

-- ============================================================
-- #13 — create_order_atomic tidak lagi bergantung ke auth.uid().
--
-- Sebelumnya (schema.production.sql): v_user uuid := auth.uid(), fungsi di-grant
-- ke `authenticated`. Tapi create-order/index.ts memanggilnya lewat client
-- service-role (admin.rpc), bukan client yang bawa JWT user. Di konteks
-- service-role, auth.uid() = null -> fungsi selalu raise 'Unauthorized'.
--
-- Fix: p_user_id dioper eksplisit dari edge function (yang sudah verifikasi
-- JWT + membership sendiri sebelum manggil RPC ini). Fungsi pindah grant ke
-- service_role, sama seperti reserve_pending_payment_atomic di bawah.
-- ============================================================

create or replace function public.create_order_atomic(
  p_tenant_id uuid,
  p_customer_name text,
  p_customer_wa text,
  p_items jsonb,
  p_discount integer default 0,
  p_tax integer default 0,
  p_pickup_time timestamptz default null,
  p_custom_text text default null,
  p_idempotency_key text default null,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := coalesce(p_user_id, auth.uid());
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

-- Ganti grant: dari `authenticated` ke `service_role`, karena satu-satunya
-- caller resmi adalah edge function create-order (service-role, sudah
-- verifikasi JWT + membership sendiri sebelum manggil RPC ini).
revoke all on function public.create_order_atomic(uuid,text,text,jsonb,integer,integer,timestamptz,text,text,uuid) from public;
revoke all on function public.create_order_atomic(uuid,text,text,jsonb,integer,integer,timestamptz,text,text) from authenticated;
grant execute on function public.create_order_atomic(uuid,text,text,jsonb,integer,integer,timestamptz,text,text,uuid) to service_role;

-- ============================================================
-- #9 — Satu payment pending per order, dijamin di level DB.
-- ============================================================

create unique index if not exists payments_order_pending_unique
  on public.payments(order_id)
  where status = 'pending';

-- Reservasi pending payment secara atomic SEBELUM edge function memanggil Midtrans.
-- Pola: lock baris order (serialize request bersamaan pada order yang sama) -> cek
-- pending payment yang sudah ada -> kalau belum ada, insert placeholder pending
-- (provider_order_id/payment_url masih null, diisi edge function setelah Midtrans respond).
--
-- Hanya dipanggil dari edge function create-payment lewat service-role client, SETELAH
-- edge function itu sendiri memverifikasi JWT user + membership ke tenant. Jadi RPC ini
-- tidak bergantung pada auth.uid() (yang tidak terisi saat dipanggil dengan service-role key).
create or replace function public.reserve_pending_payment_atomic(
  p_order_id uuid,
  p_tenant_id uuid,
  p_amount bigint
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order record;
  v_existing record;
  v_payment_id uuid := gen_random_uuid();
  v_row record;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'Nominal pembayaran tidak valid';
  end if;

  select * into v_order
  from orders
  where id = p_order_id and tenant_id = p_tenant_id
  for update;

  if not found then raise exception 'Order tidak ditemukan'; end if;
  if v_order.status in ('batal','lunas') then raise exception 'Order tidak dapat dibayar'; end if;

  select * into v_existing
  from payments
  where order_id = p_order_id and status = 'pending'
  order by created_at desc
  limit 1
  for update;

  if found then
    return jsonb_build_object('mode', 'existing', 'payment', to_jsonb(v_existing));
  end if;

  insert into payments (id, tenant_id, order_id, provider, provider_order_id, amount, status, created_at)
  values (v_payment_id, p_tenant_id, p_order_id, 'midtrans', null, p_amount, 'pending', now());

  select * into v_row from payments where id = v_payment_id;
  return jsonb_build_object('mode', 'reserved', 'payment', to_jsonb(v_row));
exception
  when unique_violation then
    -- Kalah race terhadap request lain yang barusan commit; ambil baris yang menang.
    select * into v_existing
    from payments
    where order_id = p_order_id and status = 'pending'
    order by created_at desc
    limit 1;
    if found then
      return jsonb_build_object('mode', 'existing', 'payment', to_jsonb(v_existing));
    end if;
    raise;
end;
$$;

revoke all on function public.reserve_pending_payment_atomic(uuid,uuid,bigint) from public;
grant execute on function public.reserve_pending_payment_atomic(uuid,uuid,bigint) to service_role;

-- Setelah Midtrans respond, edge function mengisi provider_order_id + payment_url + token
-- pada baris yang sudah direservasi. Dibungkus RPC juga (bukan UPDATE langsung dari edge
-- function) supaya validasi status tetap terjaga di satu tempat.
create or replace function public.attach_midtrans_details_atomic(
  p_payment_id uuid,
  p_provider_order_id text,
  p_payment_url text,
  p_qr_string text default null,
  p_qr_image_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  update payments
  set provider_order_id = p_provider_order_id,
      payment_url = p_payment_url,
      qr_string = coalesce(p_qr_string, qr_string),
      qr_image_url = coalesce(p_qr_image_url, qr_image_url)
  where id = p_payment_id and status = 'pending'
  returning * into v_row;

  if not found then raise exception 'Payment tidak ditemukan atau sudah tidak pending'; end if;
  return to_jsonb(v_row);
end;
$$;

revoke all on function public.attach_midtrans_details_atomic(uuid,text,text,text,text) from public;
grant execute on function public.attach_midtrans_details_atomic(uuid,text,text,text,text) to service_role;

-- ============================================================
-- #10 — Rate limiting sederhana per subject+action (fixed window,
-- disimpan sebagai satu baris per subject/action, direset saat window lewat).
-- ============================================================

create table if not exists public.rate_limit_state (
  subject text not null,
  action text not null,
  window_start timestamptz not null default now(),
  count integer not null default 0,
  primary key (subject, action)
);

alter table public.rate_limit_state enable row level security;
-- Tidak ada policy untuk authenticated/anon: hanya bisa diakses lewat fungsi
-- security definer di bawah (dipanggil service-role dari edge function).

create or replace function public.check_rate_limit(
  p_subject text,
  p_action text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  insert into public.rate_limit_state (subject, action, window_start, count)
  values (p_subject, p_action, v_now, 1)
  on conflict (subject, action) do update
    set window_start = case
          when public.rate_limit_state.window_start <= v_now - make_interval(secs => p_window_seconds)
          then v_now
          else public.rate_limit_state.window_start
        end,
        count = case
          when public.rate_limit_state.window_start <= v_now - make_interval(secs => p_window_seconds)
          then 1
          else public.rate_limit_state.count + 1
        end
  returning count into v_count;

  return v_count <= p_limit;
end;
$$;

revoke all on function public.check_rate_limit(text,text,integer,integer) from public;
grant execute on function public.check_rate_limit(text,text,integer,integer) to service_role;
