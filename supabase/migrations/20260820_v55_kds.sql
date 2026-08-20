-- AIWAKU V5.5 — Kitchen Display System
-- Separate kitchen fulfillment state from payment/order financial state.

alter table public.orders add column if not exists fulfillment_status text not null default 'new';
alter table public.orders drop constraint if exists orders_fulfillment_status_check;
alter table public.orders add constraint orders_fulfillment_status_check check (fulfillment_status in ('new','preparing','ready','served','cancelled'));

update public.orders
set fulfillment_status = case
  when status = 'baking' then 'preparing'
  when status = 'ready' then 'ready'
  when status = 'delivered' then 'served'
  when status = 'batal' then 'cancelled'
  else 'new'
end
where fulfillment_status = 'new';

create index if not exists orders_tenant_fulfillment_idx on public.orders(tenant_id, fulfillment_status, created_at);

create or replace function public.kitchen_update_order_status(p_order_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid(); v_order record; v_from text;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if p_status not in ('new','preparing','ready','served','cancelled') then raise exception 'Status kitchen tidak valid'; end if;
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then raise exception 'Order tidak ditemukan'; end if;
  if not is_tenant_member(v_order.tenant_id) then raise exception 'Forbidden'; end if;
  v_from := v_order.fulfillment_status;
  if v_from = p_status then return to_jsonb(v_order); end if;
  if v_from in ('cancelled','served') then raise exception 'Pesanan sudah selesai'; end if;
  if p_status = 'preparing' and v_from <> 'new' then raise exception 'Pesanan harus baru sebelum diproses'; end if;
  if p_status = 'ready' and v_from <> 'preparing' then raise exception 'Pesanan harus sedang diproses'; end if;
  if p_status = 'served' and v_from <> 'ready' then raise exception 'Pesanan harus siap sebelum disajikan'; end if;
  update public.orders set fulfillment_status = p_status, updated_at = now() where id = p_order_id;
  insert into public.audit_logs(tenant_id, action, entity, entity_id, old_value, new_value, "user", timestamp)
  values(v_order.tenant_id,'order.kitchen_status','order',p_order_id::text,jsonb_build_object('fulfillment_status',v_from),jsonb_build_object('fulfillment_status',p_status),v_user::text,now());
  select * into v_order from public.orders where id = p_order_id; return to_jsonb(v_order);
end; $$;
revoke all on function public.kitchen_update_order_status(uuid,text) from public;
grant execute on function public.kitchen_update_order_status(uuid,text) to authenticated;
