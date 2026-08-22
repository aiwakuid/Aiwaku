-- AIWAKU V5.7 — Security Hardening (Production Gate Fase 1)
-- Apply after 20260821_v57_inventory_mutation_boundary.sql

-- ============================================================
-- 1) restock_ingredient: perketat dari is_tenant_member ke
--    is_tenant_admin, konsisten dengan admin_create_ingredient /
--    admin_upsert_recipe / admin_delete_recipe.
--
--    KEPUTUSAN PRODUK: kalau bisnis Anda memang ingin staff bisa
--    melakukan restock (mis. staff yang menerima kiriman barang),
--    JANGAN apply migration ini untuk bagian restock_ingredient —
--    dokumentasikan itu sebagai keputusan sadar, bukan celah yang
--    tidak disengaja. Default di sini mengikuti prinsip least
--    privilege dan konsisten dengan fungsi admin_* lainnya.
-- ============================================================

create or replace function public.restock_ingredient(p_ingredient_id uuid, p_quantity numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_i record; v_user uuid := auth.uid(); v_stock numeric;
begin
  if v_user is null then raise exception 'Unauthorized'; end if;
  if p_quantity <= 0 then raise exception 'Jumlah restock harus lebih dari 0'; end if;
  select * into v_i from ingredients where id = p_ingredient_id for update;
  if not found then raise exception 'Bahan tidak ditemukan'; end if;
  if not is_tenant_admin(v_i.tenant_id) then raise exception 'Forbidden'; end if;
  update ingredients set stock = stock + p_quantity, updated_at = now() where id = p_ingredient_id returning stock into v_stock;
  insert into inventory_transactions(tenant_id, ingredient_id, type, quantity, stock_after, note)
  values(v_i.tenant_id, v_i.id, 'restock', p_quantity, v_stock, coalesce(p_note,'Restock manual'));
  return jsonb_build_object('id',v_i.id,'stock',v_stock);
end; $$;

-- ============================================================
-- 2) promos: tambah SELECT policy untuk tenant member biasa.
--    Sebelumnya hanya ada `promos_admin` (for all, admin-only),
--    jadi member non-admin dapat 403 saat mencoba baca promos.
-- ============================================================

drop policy if exists promos_member_read on public.promos;
create policy promos_member_read on public.promos
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
