-- AIWAKU V5.7 — Recipe + Inventory Intelligence
create table if not exists public.ingredients (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  unit text not null default 'pcs',
  stock numeric(14,3) not null default 0 check (stock >= 0),
  reorder_point numeric(14,3) not null default 0 check (reorder_point >= 0),
  cost_per_unit integer not null default 0 check (cost_per_unit >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(tenant_id, name)
);

create table if not exists public.menu_recipes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  menu_id uuid not null references public.menus(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  quantity numeric(14,3) not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique(menu_id, ingredient_id)
);

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  ingredient_id uuid not null references public.ingredients(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  type text not null check (type in ('sale','restock','adjustment','return')),
  quantity numeric(14,3) not null,
  stock_after numeric(14,3) not null,
  note text,
  created_at timestamptz not null default now()
);

create index if not exists ingredients_tenant_idx on public.ingredients(tenant_id, is_active, name);
create index if not exists recipes_menu_idx on public.menu_recipes(tenant_id, menu_id);
create index if not exists inventory_tx_tenant_idx on public.inventory_transactions(tenant_id, created_at desc);

alter table public.ingredients enable row level security;
alter table public.menu_recipes enable row level security;
alter table public.inventory_transactions enable row level security;

drop policy if exists ingredients_member on public.ingredients;
create policy ingredients_member on public.ingredients for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));
drop policy if exists recipes_member on public.menu_recipes;
create policy recipes_member on public.menu_recipes for all to authenticated
  using (is_tenant_member(tenant_id)) with check (is_tenant_member(tenant_id));
drop policy if exists inventory_member_read on public.inventory_transactions;
create policy inventory_member_read on public.inventory_transactions for select to authenticated
  using (is_tenant_member(tenant_id));
drop policy if exists inventory_server_write on public.inventory_transactions;
create policy inventory_server_write on public.inventory_transactions for insert to service_role with check (true);

create or replace function public.consume_recipe_for_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_order record; v_item jsonb; v_recipe record; v_need numeric; v_stock numeric;
begin
  select id, tenant_id, items into v_order from public.orders where id = p_order_id for update;
  if not found then return; end if;
  if exists (select 1 from inventory_transactions where order_id = p_order_id and type = 'sale') then return; end if;

  for v_item in select value from jsonb_array_elements(coalesce(v_order.items, '[]'::jsonb)) loop
    for v_recipe in
      select mr.ingredient_id, mr.quantity, i.name, i.stock, i.unit
      from menu_recipes mr join ingredients i on i.id = mr.ingredient_id
      where mr.tenant_id = v_order.tenant_id
        and mr.menu_id = (coalesce(v_item->>'menu_id', v_item->>'menuId'))::uuid
        and i.is_active = true
      for update of i
    loop
      v_need := v_recipe.quantity * floor(coalesce((v_item->>'qty')::numeric, (v_item->>'quantity')::numeric, 0));
      if v_need <= 0 then continue; end if;
      if v_recipe.stock < v_need then
        raise exception 'Bahan % tidak cukup (butuh % %, tersedia % %)', v_recipe.name, v_need, v_recipe.unit, v_recipe.stock, v_recipe.unit;
      end if;
      update ingredients set stock = stock - v_need, updated_at = now() where id = v_recipe.ingredient_id;
      select stock into v_stock from ingredients where id = v_recipe.ingredient_id;
      insert into inventory_transactions(tenant_id, ingredient_id, order_id, type, quantity, stock_after, note)
      values(v_order.tenant_id, v_recipe.ingredient_id, p_order_id, 'sale', -v_need, v_stock, 'Pemakaian resep dari order');
    end loop;
  end loop;
end; $$;

create or replace function public.restore_recipe_for_cancel(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_tx record; v_stock numeric;
begin
  if exists (select 1 from inventory_transactions where order_id = p_order_id and type = 'return') then return; end if;
  for v_tx in select * from inventory_transactions where order_id = p_order_id and type = 'sale' for update loop
    update ingredients set stock = stock + abs(v_tx.quantity), updated_at = now() where id = v_tx.ingredient_id;
    select stock into v_stock from ingredients where id = v_tx.ingredient_id;
    insert into inventory_transactions(tenant_id, ingredient_id, order_id, type, quantity, stock_after, note)
    values(v_tx.tenant_id, v_tx.ingredient_id, p_order_id, 'return', abs(v_tx.quantity), v_stock, 'Pengembalian bahan karena order dibatalkan');
  end loop;
end; $$;

create or replace function public.orders_recipe_inventory_trigger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.consume_recipe_for_order(new.id);
  elsif tg_op = 'UPDATE' and new.status = 'batal' and old.status <> 'batal' then
    perform public.restore_recipe_for_cancel(new.id);
  end if;
  return new;
end; $$;

drop trigger if exists orders_recipe_inventory_after on public.orders;
create trigger orders_recipe_inventory_after after insert or update of status on public.orders
for each row execute function public.orders_recipe_inventory_trigger();

create or replace function public.restock_ingredient(p_ingredient_id uuid, p_quantity numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_i record; v_user uuid := auth.uid(); v_stock numeric;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if p_quantity <= 0 then raise exception 'Jumlah restock harus lebih dari 0'; end if;
  select * into v_i from ingredients where id = p_ingredient_id for update;
  if not found then raise exception 'Bahan tidak ditemukan'; end if;
  if not is_tenant_member(v_i.tenant_id) then raise exception 'Forbidden'; end if;
  update ingredients set stock = stock + p_quantity, updated_at = now() where id = p_ingredient_id returning stock into v_stock;
  insert into inventory_transactions(tenant_id, ingredient_id, type, quantity, stock_after, note)
  values(v_i.tenant_id, v_i.id, 'restock', p_quantity, v_stock, coalesce(p_note,'Restock manual'));
  return jsonb_build_object('id',v_i.id,'stock',v_stock);
end; $$;
revoke all on function public.restock_ingredient(uuid,numeric,text) from public;
grant execute on function public.restock_ingredient(uuid,numeric,text) to authenticated;
