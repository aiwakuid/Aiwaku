-- AIWAKU V5.7 — Inventory Mutation Boundary
-- Apply after 20260820_v57_inventory.sql and production security foundation.

-- Remove broad member mutation policies introduced by V5.7 inventory migration.
drop policy if exists ingredients_member on public.ingredients;
drop policy if exists recipes_member on public.menu_recipes;
drop policy if exists ingredients_member_read on public.ingredients;
drop policy if exists ingredients_admin_write on public.ingredients;
drop policy if exists recipes_member_read on public.menu_recipes;
drop policy if exists recipes_admin_write on public.menu_recipes;

create policy ingredients_member_read on public.ingredients
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

create policy recipes_member_read on public.menu_recipes
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- Explicit RPC boundary. The tenant id is an input/context value, never an authorization credential.
create or replace function public.admin_create_ingredient(p_ingredient jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := nullif(p_ingredient->>'tenant_id','')::uuid;
  v_name text := btrim(coalesce(p_ingredient->>'name',''));
  v_unit text := btrim(coalesce(p_ingredient->>'unit',''));
  v_stock numeric := coalesce((p_ingredient->>'stock')::numeric, 0);
  v_reorder numeric := coalesce((p_ingredient->>'reorder_point')::numeric, 0);
  v_cost integer := coalesce((p_ingredient->>'cost_per_unit')::integer, 0);
  v_row public.ingredients;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if v_tenant is null then raise exception 'tenant_id wajib diisi'; end if;
  if not public.is_tenant_admin(v_tenant) then raise exception 'Forbidden'; end if;
  if v_name = '' then raise exception 'Nama bahan wajib diisi'; end if;
  if v_unit = '' then raise exception 'Unit wajib diisi'; end if;
  if v_stock < 0 then raise exception 'Stock tidak boleh negatif'; end if;
  if v_reorder < 0 then raise exception 'Reorder point tidak boleh negatif'; end if;
  if v_cost < 0 then raise exception 'Cost per unit tidak boleh negatif'; end if;

  insert into public.ingredients(tenant_id, name, unit, stock, reorder_point, cost_per_unit)
  values(v_tenant, v_name, v_unit, v_stock, v_reorder, v_cost)
  returning * into v_row;

  return to_jsonb(v_row);
exception
  when unique_violation then
    raise exception 'Nama bahan sudah ada di tenant ini';
end;
$$;

create or replace function public.admin_upsert_recipe(p_recipe jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := nullif(p_recipe->>'tenant_id','')::uuid;
  v_menu uuid := nullif(p_recipe->>'menu_id','')::uuid;
  v_ingredient uuid := nullif(p_recipe->>'ingredient_id','')::uuid;
  v_quantity numeric := (p_recipe->>'quantity')::numeric;
  v_row public.menu_recipes;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;
  if v_tenant is null or v_menu is null or v_ingredient is null then
    raise exception 'tenant_id, menu_id, dan ingredient_id wajib diisi';
  end if;
  if not public.is_tenant_admin(v_tenant) then raise exception 'Forbidden'; end if;
  if v_quantity is null or v_quantity <= 0 then raise exception 'Quantity harus lebih dari 0'; end if;

  if not exists (select 1 from public.menus m where m.id = v_menu and m.tenant_id = v_tenant) then
    raise exception 'Menu tidak ditemukan pada tenant';
  end if;
  if not exists (select 1 from public.ingredients i where i.id = v_ingredient and i.tenant_id = v_tenant) then
    raise exception 'Bahan tidak ditemukan pada tenant';
  end if;

  insert into public.menu_recipes(tenant_id, menu_id, ingredient_id, quantity)
  values(v_tenant, v_menu, v_ingredient, v_quantity)
  on conflict (menu_id, ingredient_id)
  do update set tenant_id = excluded.tenant_id, quantity = excluded.quantity
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

create or replace function public.admin_delete_recipe(p_recipe_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_deleted public.menu_recipes;
begin
  if auth.uid() is null then raise exception 'Unauthorized'; end if;

  select tenant_id into v_tenant
  from public.menu_recipes
  where id = p_recipe_id
  for update;

  if v_tenant is null then raise exception 'Recipe tidak ditemukan'; end if;
  if not public.is_tenant_admin(v_tenant) then raise exception 'Forbidden'; end if;

  delete from public.menu_recipes
  where id = p_recipe_id
  returning * into v_deleted;

  return jsonb_build_object('success', true, 'recipe', to_jsonb(v_deleted));
end;
$$;

revoke all on function public.admin_create_ingredient(jsonb) from public;
revoke all on function public.admin_upsert_recipe(jsonb) from public;
revoke all on function public.admin_delete_recipe(uuid) from public;
grant execute on function public.admin_create_ingredient(jsonb) to authenticated;
grant execute on function public.admin_upsert_recipe(jsonb) to authenticated;
grant execute on function public.admin_delete_recipe(uuid) to authenticated;

-- Inventory transactions remain read-only to tenant members and are not client-writable.
drop policy if exists inventory_member_read on public.inventory_transactions;
drop policy if exists inventory_member_write on public.inventory_transactions;
drop policy if exists inventory_transactions_member_write on public.inventory_transactions;
drop policy if exists inventory_server_write on public.inventory_transactions;
create policy inventory_member_read on public.inventory_transactions
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy inventory_server_write on public.inventory_transactions
  for insert to service_role
  with check (true);
