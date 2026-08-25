


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."admin_create_ingredient"("p_ingredient" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_create_ingredient"("p_ingredient" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_delete_recipe"("p_recipe_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_delete_recipe"("p_recipe_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_customer"("p_customer" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
                                                                                                                                                                                                                                                                                                                  declare
                                                                                                                                                                                                                                                                                                                    v_id uuid;
                                                                                                                                                                                                                                                                                                                      v_tenant uuid;
                                                                                                                                                                                                                                                                                                                      begin

                                                                                                                                                                                                                                                                                                                        v_id := nullif(
                                                                                                                                                                                                                                                                                                                            p_customer->>'id',
                                                                                                                                                                                                                                                                                                                                ''
                                                                                                                                                                                                                                                                                                                                  )::uuid;

                                                                                                                                                                                                                                                                                                                                    v_tenant := (p_customer->>'tenant_id')::uuid;


                                                                                                                                                                                                                                                                                                                                      if not is_tenant_member(v_tenant) then
                                                                                                                                                                                                                                                                                                                                          raise exception 'Forbidden';
                                                                                                                                                                                                                                                                                                                                            end if;


                                                                                                                                                                                                                                                                                                                                              insert into public.customers (
                                                                                                                                                                                                                                                                                                                                                  id,
                                                                                                                                                                                                                                                                                                                                                      tenant_id,
                                                                                                                                                                                                                                                                                                                                                          name,
                                                                                                                                                                                                                                                                                                                                                              wa,
                                                                                                                                                                                                                                                                                                                                                                  email,
                                                                                                                                                                                                                                                                                                                                                                      notes,
                                                                                                                                                                                                                                                                                                                                                                          total_orders,
                                                                                                                                                                                                                                                                                                                                                                              total_spent,
                                                                                                                                                                                                                                                                                                                                                                                  last_order_at,
                                                                                                                                                                                                                                                                                                                                                                                      tags,
                                                                                                                                                                                                                                                                                                                                                                                          created_at
                                                                                                                                                                                                                                                                                                                                                                                            )
                                                                                                                                                                                                                                                                                                                                                                                              values (
                                                                                                                                                                                                                                                                                                                                                                                                  coalesce(v_id, gen_random_uuid()),
                                                                                                                                                                                                                                                                                                                                                                                                      v_tenant,
                                                                                                                                                                                                                                                                                                                                                                                                          trim(p_customer->>'name'),
                                                                                                                                                                                                                                                                                                                                                                                                              trim(p_customer->>'wa'),
                                                                                                                                                                                                                                                                                                                                                                                                                  p_customer->>'email',
                                                                                                                                                                                                                                                                                                                                                                                                                      p_customer->>'notes',
                                                                                                                                                                                                                                                                                                                                                                                                                          coalesce(
                                                                                                                                                                                                                                                                                                                                                                                                                                (p_customer->>'total_orders')::int,
                                                                                                                                                                                                                                                                                                                                                                                                                                      0
                                                                                                                                                                                                                                                                                                                                                                                                                                          ),
                                                                                                                                                                                                                                                                                                                                                                                                                                              coalesce(
                                                                                                                                                                                                                                                                                                                                                                                                                                                    (p_customer->>'total_spent')::int,
                                                                                                                                                                                                                                                                                                                                                                                                                                                          0
                                                                                                                                                                                                                                                                                                                                                                                                                                                              ),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                  nullif(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                        p_customer->>'last_order_at',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ''
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  )::timestamptz,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      coalesce(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            array(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    select jsonb_array_elements_text(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              coalesce(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          p_customer->'tags',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      '[]'::jsonb
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              ),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    '{}'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            coalesce(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  (p_customer->>'created_at')::timestamptz,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        now()
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              )

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                on conflict (id)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  do update set
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      name = excluded.name,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          wa = excluded.wa,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              email = excluded.email,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  notes = excluded.notes,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      total_orders = excluded.total_orders,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          total_spent = excluded.total_spent,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              last_order_at = excluded.last_order_at,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  tags = excluded.tags

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    returning id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      into v_id;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        return (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            select to_jsonb(c)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                from public.customers c
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    where c.id = v_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      $$;


ALTER FUNCTION "public"."admin_upsert_customer"("p_customer" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_menu"("p_menu" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  declare
    v_id uuid;
      v_tenant uuid;
      begin

        v_id := nullif(
            p_menu->>'id',
                ''
                  )::uuid;

                    v_tenant := (p_menu->>'tenant_id')::uuid;


                      if not is_tenant_admin(v_tenant) then
                          raise exception 'Forbidden';
                            end if;


                              insert into public.menus (
                                  id,
                                      tenant_id,
                                          name,
                                              price,
                                                  stock,
                                                      is_active,
                                                          description,
                                                              emoji,
                                                                  custom_fields,
                                                                      niche,
                                                                          image_url,
                                                                              created_at,
                                                                                  updated_at
                                                                                    )
                                                                                      values (
                                                                                          coalesce(v_id, gen_random_uuid()),
                                                                                              v_tenant,
                                                                                                  trim(p_menu->>'name'),
                                                                                                      greatest(
                                                                                                            0,
                                                                                                                  (p_menu->>'price')::int
                                                                                                                      ),
                                                                                                                          greatest(
                                                                                                                                0,
                                                                                                                                      (p_menu->>'stock')::int
                                                                                                                                          ),
                                                                                                                                              coalesce(
                                                                                                                                                    (p_menu->>'is_active')::boolean,
                                                                                                                                                          true
                                                                                                                                                              ),
                                                                                                                                                                  p_menu->>'description',
                                                                                                                                                                      coalesce(
                                                                                                                                                                            p_menu->>'emoji',
                                                                                                                                                                                  '📦'
                                                                                                                                                                                      ),
                                                                                                                                                                                          coalesce(
                                                                                                                                                                                                p_menu->'custom_fields',
                                                                                                                                                                                                      '{}'::jsonb
                                                                                                                                                                                                          ),
                                                                                                                                                                                                              p_menu->>'niche',
                                                                                                                                                                                                                  p_menu->>'image_url',
                                                                                                                                                                                                                      coalesce(
                                                                                                                                                                                                                            (p_menu->>'created_at')::timestamptz,
                                                                                                                                                                                                                                  now()
                                                                                                                                                                                                                                      ),
                                                                                                                                                                                                                                          now()
                                                                                                                                                                                                                                            )

                                                                                                                                                                                                                                              on conflict (id)
                                                                                                                                                                                                                                                do update set
                                                                                                                                                                                                                                                    name = excluded.name,
                                                                                                                                                                                                                                                        price = excluded.price,
                                                                                                                                                                                                                                                            stock = excluded.stock,
                                                                                                                                                                                                                                                                is_active = excluded.is_active,
                                                                                                                                                                                                                                                                    description = excluded.description,
                                                                                                                                                                                                                                                                        emoji = excluded.emoji,
                                                                                                                                                                                                                                                                            custom_fields = excluded.custom_fields,
                                                                                                                                                                                                                                                                                niche = excluded.niche,
                                                                                                                                                                                                                                                                                    image_url = excluded.image_url,
                                                                                                                                                                                                                                                                                        updated_at = now()

                                                                                                                                                                                                                                                                                          returning id
                                                                                                                                                                                                                                                                                            into v_id;


                                                                                                                                                                                                                                                                                              return (
                                                                                                                                                                                                                                                                                                  select to_jsonb(m)
                                                                                                                                                                                                                                                                                                      from public.menus m
                                                                                                                                                                                                                                                                                                          where m.id = v_id
                                                                                                                                                                                                                                                                                                            );

                                                                                                                                                                                                                                                                                                            end;
                                                                                                                                                                                                                                                                                                            $$;


ALTER FUNCTION "public"."admin_upsert_menu"("p_menu" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."admin_upsert_recipe"("p_recipe" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."admin_upsert_recipe"("p_recipe" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."attach_midtrans_details_atomic"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_payment_url" "text", "p_qr_string" "text" DEFAULT NULL::"text", "p_qr_image_url" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."attach_midtrans_details_atomic"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_payment_url" "text", "p_qr_string" "text", "p_qr_image_url" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."book_slot_atomic"("p_booking" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  declare
    v_tenant uuid;
      v_id uuid;
        v_result public.bookings;
        begin

          v_tenant := (p_booking->>'tenant_id')::uuid;
            v_id := nullif(
                p_booking->>'id',
                    ''
                      )::uuid;


                        if not is_tenant_member(v_tenant) then
                            raise exception 'Forbidden';
                              end if;


                                if exists (
                                    select 1
                                        from public.bookings
                                            where tenant_id = v_tenant
                                                  and date = (p_booking->>'date')::date
                                                        and field_no = p_booking->>'field_no'
                                                              and start_time = (p_booking->>'start_time')::time
                                                                    and status <> 'batal'
                                                                          and id <> coalesce(
                                                                                  v_id,
                                                                                          '00000000-0000-0000-0000-000000000000'::uuid
                                                                                                )
                                                                                                  ) then
                                                                                                      raise exception 'Slot sudah dipesan';
                                                                                                        end if;


                                                                                                          insert into public.bookings (
                                                                                                              id,
                                                                                                                  tenant_id,
                                                                                                                      date,
                                                                                                                          start_time,
                                                                                                                              end_time,
                                                                                                                                  field_no,
                                                                                                                                      customer_name,
                                                                                                                                          customer_wa,
                                                                                                                                              status,
                                                                                                                                                  price,
                                                                                                                                                      customer_id,
                                                                                                                                                          order_id
                                                                                                                                                            )
                                                                                                                                                              values (
                                                                                                                                                                  coalesce(v_id, gen_random_uuid()),
                                                                                                                                                                      v_tenant,
                                                                                                                                                                          (p_booking->>'date')::date,
                                                                                                                                                                              (p_booking->>'start_time')::time,
                                                                                                                                                                                  (p_booking->>'end_time')::time,
                                                                                                                                                                                      p_booking->>'field_no',
                                                                                                                                                                                          p_booking->>'customer_name',
                                                                                                                                                                                              p_booking->>'customer_wa',
                                                                                                                                                                                                  'booked',
                                                                                                                                                                                                      coalesce(
                                                                                                                                                                                                            (p_booking->>'price')::int,
                                                                                                                                                                                                                  0
                                                                                                                                                                                                                      ),
                                                                                                                                                                                                                          nullif(
                                                                                                                                                                                                                                p_booking->>'customer_id',
                                                                                                                                                                                                                                      ''
                                                                                                                                                                                                                                          )::uuid,
                                                                                                                                                                                                                                              nullif(
                                                                                                                                                                                                                                                    p_booking->>'order_id',
                                                                                                                                                                                                                                                          ''
                                                                                                                                                                                                                                                              )::uuid
                                                                                                                                                                                                                                                                )
                                                                                                                                                                                                                                                                  on conflict (id)
                                                                                                                                                                                                                                                                    do update set
                                                                                                                                                                                                                                                                        customer_name = excluded.customer_name,
                                                                                                                                                                                                                                                                            customer_wa = excluded.customer_wa,
                                                                                                                                                                                                                                                                                status = 'booked',
                                                                                                                                                                                                                                                                                    price = excluded.price

                                                                                                                                                                                                                                                                                      returning *
                                                                                                                                                                                                                                                                                        into v_result;


                                                                                                                                                                                                                                                                                          return to_jsonb(v_result);

                                                                                                                                                                                                                                                                                          end;
                                                                                                                                                                                                                                                                                          $$;


ALTER FUNCTION "public"."book_slot_atomic"("p_booking" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bot_create_order_atomic"("p_tenant_id" "uuid", "p_customer_wa" "text", "p_customer_name" "text", "p_items" "jsonb", "p_conversation_id" "uuid", "p_idempotency_key" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_item jsonb;
  v_menu record;
  v_qty integer;
  v_subtotal bigint := 0;
  v_total bigint;
  v_order_id uuid := gen_random_uuid();
  v_invoice text;
  v_existing jsonb;
  v_normalized jsonb := '[]'::jsonb;
  v_key text := coalesce(p_idempotency_key, p_conversation_id::text);
begin
  if p_items is null or jsonb_array_length(p_items) = 0 then
    raise exception 'Order kosong';
  end if;

  select to_jsonb(o) into v_existing
  from orders o
  where o.tenant_id = p_tenant_id and o.idempotency_key = v_key
  limit 1;
  if v_existing is not null then
    return v_existing;
  end if;

  for v_item in
    select value from jsonb_array_elements(p_items)
    order by coalesce(value->>'menu_id', value->>'menuId')
  loop
    v_qty := floor(coalesce((v_item->>'qty')::numeric, 0));
    if v_qty <= 0 then raise exception 'Quantity tidak valid'; end if;

    select id, name, price, stock, is_active into v_menu
    from menus where id = (v_item->>'menu_id')::uuid and tenant_id = p_tenant_id
    for update;

    if not found then raise exception 'Produk tidak ditemukan'; end if;
    if not v_menu.is_active then raise exception 'Produk tidak aktif: %', v_menu.name; end if;
    if v_menu.stock < v_qty then raise exception 'Stok % tidak cukup', v_menu.name; end if;

    v_subtotal := v_subtotal + (v_menu.price::bigint * v_qty);
    v_normalized := v_normalized || jsonb_build_object(
      'menu_id', v_menu.id, 'name', v_menu.name, 'qty', v_qty,
      'price', v_menu.price, 'subtotal', v_menu.price::bigint * v_qty
    );
    update menus set stock = stock - v_qty where id = v_menu.id;
  end loop;

  v_total := v_subtotal;
  v_invoice := 'WA-' || to_char(now(), 'YYYYMMDD') || '-' || substr(v_order_id::text, 1, 6);

  insert into orders (
    id, tenant_id, invoice_no, customer_name, customer_wa, items,
    subtotal, discount, tax, total, dp, remaining, status, idempotency_key, created_at
  ) values (
    v_order_id, p_tenant_id, v_invoice, coalesce(p_customer_name, p_customer_wa), p_customer_wa, v_normalized,
    v_subtotal, 0, 0, v_total, 0, v_total, 'pending', v_key, now()
  );

  update wa_conversations set context = context || jsonb_build_object('order_id', v_order_id) where id = p_conversation_id;

  select to_jsonb(o) into v_existing from orders o where o.id = v_order_id;
  return v_existing;
end;
$$;


ALTER FUNCTION "public"."bot_create_order_atomic"("p_tenant_id" "uuid", "p_customer_wa" "text", "p_customer_name" "text", "p_items" "jsonb", "p_conversation_id" "uuid", "p_idempotency_key" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."bot_record_cash_payment"("p_tenant_id" "uuid", "p_order_id" "uuid", "p_amount" bigint, "p_conversation_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."bot_record_cash_payment"("p_tenant_id" "uuid", "p_order_id" "uuid", "p_amount" bigint, "p_conversation_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_booking_atomic"("p_booking_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
                                                                                                                                                                                                                                                                                                declare
                                                                                                                                                                                                                                                                                                  v_row public.bookings;
                                                                                                                                                                                                                                                                                                  begin

                                                                                                                                                                                                                                                                                                    select *
                                                                                                                                                                                                                                                                                                      into v_row
                                                                                                                                                                                                                                                                                                        from public.bookings
                                                                                                                                                                                                                                                                                                          where id = p_booking_id
                                                                                                                                                                                                                                                                                                            for update;


                                                                                                                                                                                                                                                                                                              if not found then
                                                                                                                                                                                                                                                                                                                  raise exception 'Booking tidak ditemukan';
                                                                                                                                                                                                                                                                                                                    end if;


                                                                                                                                                                                                                                                                                                                      if not is_tenant_member(v_row.tenant_id) then
                                                                                                                                                                                                                                                                                                                          raise exception 'Forbidden';
                                                                                                                                                                                                                                                                                                                            end if;


                                                                                                                                                                                                                                                                                                                              update public.bookings
                                                                                                                                                                                                                                                                                                                                set status = 'batal'
                                                                                                                                                                                                                                                                                                                                  where id = p_booking_id;


                                                                                                                                                                                                                                                                                                                                    select *
                                                                                                                                                                                                                                                                                                                                      into v_row
                                                                                                                                                                                                                                                                                                                                        from public.bookings
                                                                                                                                                                                                                                                                                                                                          where id = p_booking_id;


                                                                                                                                                                                                                                                                                                                                            return to_jsonb(v_row);

                                                                                                                                                                                                                                                                                                                                            end;
                                                                                                                                                                                                                                                                                                                                            $$;


ALTER FUNCTION "public"."cancel_booking_atomic"("p_booking_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."cancel_order_atomic"("p_order_id" "uuid", "p_reason" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
      declare
        v_user uuid := auth.uid();
          v_order record;
            v_item jsonb;
              v_qty integer;
              begin

                if v_user is null then
                    raise exception 'Unauthorized';
                      end if;


                        select *
                          into v_order
                            from public.orders
                              where id = p_order_id
                                for update;


                                  if not found then
                                      raise exception 'Order tidak ditemukan';
                                        end if;


                                          if not exists (
                                              select 1
                                                  from public.tenant_members
                                                      where tenant_id = v_order.tenant_id
                                                            and user_id = v_user
                                                              ) then
                                                                  raise exception 'Forbidden';
                                                                    end if;


                                                                      -- Sudah batal/lunas tidak diproses ulang
                                                                        if v_order.status in ('batal', 'cancelled', 'lunas') then
                                                                            return to_jsonb(v_order);
                                                                              end if;


                                                                                -- Kembalikan stok
                                                                                  for v_item in
                                                                                      select value
                                                                                          from jsonb_array_elements(v_order.items)
                                                                                            loop

                                                                                                v_qty := floor(
                                                                                                      coalesce(
                                                                                                              (v_item->>'qty')::numeric,
                                                                                                                      0
                                                                                                                            )
                                                                                                                                );

                                                                                                                                    if v_qty > 0 then

                                                                                                                                          update public.menus
                                                                                                                                                set
                                                                                                                                                        stock = stock + v_qty,
                                                                                                                                                                updated_at = now()
                                                                                                                                                                      where id = (v_item->>'menu_id')::uuid
                                                                                                                                                                              and tenant_id = v_order.tenant_id;

                                                                                                                                                                                  end if;

                                                                                                                                                                                    end loop;


                                                                                                                                                                                      -- Batalkan order
                                                                                                                                                                                        update public.orders
                                                                                                                                                                                          set
                                                                                                                                                                                              status = 'batal',
                                                                                                                                                                                                  remaining = 0,
                                                                                                                                                                                                      fulfillment_status = 'cancelled',
                                                                                                                                                                                                          updated_at = now()
                                                                                                                                                                                                            where id = p_order_id;


                                                                                                                                                                                                              -- Audit
                                                                                                                                                                                                                insert into public.audit_logs (
                                                                                                                                                                                                                    tenant_id,
                                                                                                                                                                                                                        action,
                                                                                                                                                                                                                            entity,
                                                                                                                                                                                                                                entity_id,
                                                                                                                                                                                                                                    old_value,
                                                                                                                                                                                                                                        new_value,
                                                                                                                                                                                                                                            "user",
                                                                                                                                                                                                                                                timestamp
                                                                                                                                                                                                                                                  )
                                                                                                                                                                                                                                                    values (
                                                                                                                                                                                                                                                        v_order.tenant_id,
                                                                                                                                                                                                                                                            'order.cancel',
                                                                                                                                                                                                                                                                'order',
                                                                                                                                                                                                                                                                    p_order_id::text,
                                                                                                                                                                                                                                                                        jsonb_build_object(
                                                                                                                                                                                                                                                                              'status',
                                                                                                                                                                                                                                                                                    v_order.status
                                                                                                                                                                                                                                                                                        ),
                                                                                                                                                                                                                                                                                            jsonb_build_object(
                                                                                                                                                                                                                                                                                                  'status',
                                                                                                                                                                                                                                                                                                        'batal',
                                                                                                                                                                                                                                                                                                              'reason',
                                                                                                                                                                                                                                                                                                                    p_reason
                                                                                                                                                                                                                                                                                                                        ),
                                                                                                                                                                                                                                                                                                                            v_user::text,
                                                                                                                                                                                                                                                                                                                                now()
                                                                                                                                                                                                                                                                                                                                  );


                                                                                                                                                                                                                                                                                                                                    select *
                                                                                                                                                                                                                                                                                                                                      into v_order
                                                                                                                                                                                                                                                                                                                                        from public.orders
                                                                                                                                                                                                                                                                                                                                          where id = p_order_id;


                                                                                                                                                                                                                                                                                                                                            return to_jsonb(v_order);

                                                                                                                                                                                                                                                                                                                                            end;
                                                                                                                                                                                                                                                                                                                                            $$;


ALTER FUNCTION "public"."cancel_order_atomic"("p_order_id" "uuid", "p_reason" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."check_rate_limit"("p_subject" "text", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."check_rate_limit"("p_subject" "text", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."complete_registration_from_metadata"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."complete_registration_from_metadata"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."consume_recipe_for_order"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."consume_recipe_for_order"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_order_atomic"("p_tenant_id" "uuid", "p_customer_name" "text", "p_customer_wa" "text", "p_items" "jsonb", "p_discount" integer DEFAULT 0, "p_tax" integer DEFAULT 0, "p_pickup_time" timestamp with time zone DEFAULT NULL::timestamp with time zone, "p_custom_text" "text" DEFAULT NULL::"text", "p_idempotency_key" "text" DEFAULT NULL::"text", "p_user_id" "uuid" DEFAULT NULL::"uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."create_order_atomic"("p_tenant_id" "uuid", "p_customer_name" "text", "p_customer_wa" "text", "p_items" "jsonb", "p_discount" integer, "p_tax" integer, "p_pickup_time" timestamp with time zone, "p_custom_text" "text", "p_idempotency_key" "text", "p_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_admin"("target_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
                                                                  select exists (
                                                                      select 1
                                                                          from public.tenant_members tm
                                                                              where tm.tenant_id = target_tenant
                                                                                    and tm.user_id = auth.uid()
                                                                                          and tm.role in ('owner','admin')
                                                                                            );
                                                                                            $$;


ALTER FUNCTION "public"."is_tenant_admin"("target_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_tenant_member"("target_tenant" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
                                            select exists (
                                                select 1
                                                    from public.tenant_members tm
                                                        where tm.tenant_id = target_tenant
                                                              and tm.user_id = auth.uid()
                                                                );
                                                                $$;


ALTER FUNCTION "public"."is_tenant_member"("target_tenant" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."kitchen_update_order_status"("p_order_id" "uuid", "p_status" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."kitchen_update_order_status"("p_order_id" "uuid", "p_status" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."mark_payment_paid"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_amount" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
                                                                                                                                                                                                                                                                                                                                                                                                                                    declare
                                                                                                                                                                                                                                                                                                                                                                                                                                      v_payment record;
                                                                                                                                                                                                                                                                                                                                                                                                                                        v_order record;
                                                                                                                                                                                                                                                                                                                                                                                                                                        begin

                                                                                                                                                                                                                                                                                                                                                                                                                                          select *
                                                                                                                                                                                                                                                                                                                                                                                                                                            into v_payment
                                                                                                                                                                                                                                                                                                                                                                                                                                              from public.payments
                                                                                                                                                                                                                                                                                                                                                                                                                                                where id = p_payment_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                    and provider_order_id = p_provider_order_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                      for update;

                                                                                                                                                                                                                                                                                                                                                                                                                                                        if not found then
                                                                                                                                                                                                                                                                                                                                                                                                                                                            raise exception 'Payment tidak ditemukan';
                                                                                                                                                                                                                                                                                                                                                                                                                                                              end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                if v_payment.status = 'paid' then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                    return to_jsonb(v_payment);
                                                                                                                                                                                                                                                                                                                                                                                                                                                                      end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                        if v_payment.amount <> p_amount then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                            raise exception 'Nominal payment tidak cocok';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                              end if;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                update public.payments
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  set
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      status = 'paid',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          paid_at = now()
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            where id = v_payment.id;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              if v_payment.order_id is not null then

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  select *
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      into v_order
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          from public.orders
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              where id = v_payment.order_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  for update;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      if found then

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            update public.orders
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  set
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          dp = least(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    total,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              coalesce(dp, 0) + v_payment.amount
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              remaining = greatest(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        0,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  total -
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            least(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        total,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    coalesce(dp, 0) + v_payment.amount
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      ),
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              status =
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        case
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    when greatest(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  0,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                total -
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              least(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              total,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              coalesce(dp, 0) + v_payment.amount
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        ) = 0
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    then 'lunas'
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                else status
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          end,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  updated_at = now()
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        where id = v_order.id;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            end if;

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              end if;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                return (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    select to_jsonb(p)
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        from public.payments p
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            where p.id = v_payment.id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              $$;


ALTER FUNCTION "public"."mark_payment_paid"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_amount" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."orders_recipe_inventory_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if tg_op = 'INSERT' then
    perform public.consume_recipe_for_order(new.id);
  elsif tg_op = 'UPDATE' and new.status = 'batal' and old.status <> 'batal' then
    perform public.restore_recipe_for_cancel(new.id);
  end if;
  return new;
end; $$;


ALTER FUNCTION "public"."orders_recipe_inventory_trigger"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_cash_payment"("p_order_id" "uuid", "p_amount" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
    declare
      v_order record;
        v_payment record;
          v_amount bigint;
          begin

            select *
              into v_order
                from public.orders
                  where id = p_order_id
                    for update;

                      if not found then
                          raise exception 'Order tidak ditemukan';
                            end if;

                              if not is_tenant_member(v_order.tenant_id) then
                                  raise exception 'Forbidden';
                                    end if;

                                      v_amount :=
                                          greatest(
                                                0,
                                                      least(
                                                              coalesce(v_order.remaining, v_order.total),
                                                                      p_amount
                                                                            )
                                                                                );

                                                                                  if v_amount <= 0 then
                                                                                      raise exception 'Nominal pembayaran tidak valid';
                                                                                        end if;


                                                                                          insert into public.payments (
                                                                                              tenant_id,
                                                                                                  order_id,
                                                                                                      provider,
                                                                                                          provider_order_id,
                                                                                                              amount,
                                                                                                                  status,
                                                                                                                      paid_at,
                                                                                                                          created_at
                                                                                                                            )
                                                                                                                              values (
                                                                                                                                  v_order.tenant_id,
                                                                                                                                      v_order.id,
                                                                                                                                          'manual',
                                                                                                                                              'CASH-' ||
                                                                                                                                                    v_order.id::text ||
                                                                                                                                                          '-' ||
                                                                                                                                                                extract(epoch from clock_timestamp())::bigint,
                                                                                                                                                                    v_amount,
                                                                                                                                                                        'paid',
                                                                                                                                                                            now(),
                                                                                                                                                                                now()
                                                                                                                                                                                  )
                                                                                                                                                                                    returning *
                                                                                                                                                                                      into v_payment;


                                                                                                                                                                                        update public.orders
                                                                                                                                                                                          set
                                                                                                                                                                                              dp = least(
                                                                                                                                                                                                    total,
                                                                                                                                                                                                          coalesce(dp, 0) + v_amount
                                                                                                                                                                                                              ),
                                                                                                                                                                                                                  remaining = greatest(
                                                                                                                                                                                                                        0,
                                                                                                                                                                                                                              total -
                                                                                                                                                                                                                                    least(
                                                                                                                                                                                                                                            total,
                                                                                                                                                                                                                                                    coalesce(dp, 0) + v_amount
                                                                                                                                                                                                                                                          )
                                                                                                                                                                                                                                                              ),
                                                                                                                                                                                                                                                                  status =
                                                                                                                                                                                                                                                                        case
                                                                                                                                                                                                                                                                                when greatest(
                                                                                                                                                                                                                                                                                          0,
                                                                                                                                                                                                                                                                                                    total -
                                                                                                                                                                                                                                                                                                              least(
                                                                                                                                                                                                                                                                                                                          total,
                                                                                                                                                                                                                                                                                                                                      coalesce(dp, 0) + v_amount
                                                                                                                                                                                                                                                                                                                                                )
                                                                                                                                                                                                                                                                                                                                                        ) = 0
                                                                                                                                                                                                                                                                                                                                                                then 'lunas'
                                                                                                                                                                                                                                                                                                                                                                        else 'dp'
                                                                                                                                                                                                                                                                                                                                                                              end,
                                                                                                                                                                                                                                                                                                                                                                                  updated_at = now()
                                                                                                                                                                                                                                                                                                                                                                                    where id = v_order.id;


                                                                                                                                                                                                                                                                                                                                                                                      return jsonb_build_object(
                                                                                                                                                                                                                                                                                                                                                                                          'payment', to_jsonb(v_payment),
                                                                                                                                                                                                                                                                                                                                                                                              'order', (
                                                                                                                                                                                                                                                                                                                                                                                                    select to_jsonb(o)
                                                                                                                                                                                                                                                                                                                                                                                                          from public.orders o
                                                                                                                                                                                                                                                                                                                                                                                                                where o.id = v_order.id
                                                                                                                                                                                                                                                                                                                                                                                                                    )
                                                                                                                                                                                                                                                                                                                                                                                                                      );

                                                                                                                                                                                                                                                                                                                                                                                                                      end;
                                                                                                                                                                                                                                                                                                                                                                                                                      $$;


ALTER FUNCTION "public"."record_cash_payment"("p_order_id" "uuid", "p_amount" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."register_tenant_atomic"("p_tenant_name" "text", "p_slug" "text", "p_niche" "text", "p_owner_name" "text" DEFAULT NULL::"text", "p_wa_number" "text" DEFAULT NULL::"text", "p_features" "text"[] DEFAULT '{}'::"text"[]) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $_$
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
$_$;


ALTER FUNCTION "public"."register_tenant_atomic"("p_tenant_name" "text", "p_slug" "text", "p_niche" "text", "p_owner_name" "text", "p_wa_number" "text", "p_features" "text"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reserve_pending_payment_atomic"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" bigint) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."reserve_pending_payment_atomic"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" bigint) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restock_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric, "p_note" "text" DEFAULT NULL::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."restock_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric, "p_note" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."restore_recipe_for_cancel"("p_order_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
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


ALTER FUNCTION "public"."restore_recipe_for_cancel"("p_order_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."write_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_old_value" "jsonb" DEFAULT NULL::"jsonb", "p_new_value" "jsonb" DEFAULT NULL::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      declare
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        v_id uuid;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        begin

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          if not is_tenant_member(p_tenant_id) then
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              raise exception 'Forbidden';
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                end if;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  insert into public.audit_logs (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      tenant_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          action,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              entity,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  entity_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      old_value,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          new_value,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              "user",
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  timestamp
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      values (
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          p_tenant_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              p_action,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  p_entity,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      p_entity_id,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          p_old_value,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              p_new_value,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  auth.uid()::text,
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      now()
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        )
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          returning id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            into v_id;


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              return jsonb_build_object(
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  'id',
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      v_id
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        );

                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        end;
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        $$;


ALTER FUNCTION "public"."write_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_old_value" "jsonb", "p_new_value" "jsonb") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."audit_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "entity" "text" NOT NULL,
    "entity_id" "text",
    "old_value" "jsonb",
    "new_value" "jsonb",
    "user" "text" DEFAULT 'admin'::"text",
    "timestamp" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."bookings" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "date" "date" NOT NULL,
    "start_time" time without time zone NOT NULL,
    "end_time" time without time zone NOT NULL,
    "field_no" "text",
    "customer_name" "text",
    "customer_wa" "text",
    "status" "text" DEFAULT 'booked'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "price" integer DEFAULT 0,
    "customer_id" "uuid",
    "order_id" "uuid",
    CONSTRAINT "bookings_status_check" CHECK (("status" = ANY (ARRAY['booked'::"text", 'selesai'::"text", 'batal'::"text"])))
);


ALTER TABLE "public"."bookings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."chats" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_wa" "text" NOT NULL,
    "customer_name" "text",
    "messages" "jsonb" DEFAULT '[]'::"jsonb",
    "ai_active" boolean DEFAULT true,
    "last_message_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."chats" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "wa" "text" NOT NULL,
    "email" "text",
    "notes" "text",
    "total_orders" integer DEFAULT 0,
    "total_spent" integer DEFAULT 0,
    "last_order_at" timestamp with time zone,
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."customers" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."feature_catalog" (
    "key" "text" NOT NULL,
    "label" "text" NOT NULL,
    "description" "text",
    "sort_order" integer DEFAULT 0 NOT NULL,
    "is_available" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."feature_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."ingredients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "unit" "text" DEFAULT 'pcs'::"text" NOT NULL,
    "stock" numeric(14,3) DEFAULT 0 NOT NULL,
    "reorder_point" numeric(14,3) DEFAULT 0 NOT NULL,
    "cost_per_unit" integer DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ingredients_cost_per_unit_check" CHECK (("cost_per_unit" >= 0)),
    CONSTRAINT "ingredients_reorder_point_check" CHECK (("reorder_point" >= (0)::numeric)),
    CONSTRAINT "ingredients_stock_check" CHECK (("stock" >= (0)::numeric))
);


ALTER TABLE "public"."ingredients" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."inventory_transactions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "order_id" "uuid",
    "type" "text" NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "stock_after" numeric(14,3) NOT NULL,
    "note" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "inventory_transactions_type_check" CHECK (("type" = ANY (ARRAY['sale'::"text", 'restock'::"text", 'adjustment'::"text", 'return'::"text"])))
);


ALTER TABLE "public"."inventory_transactions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menu_recipes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "menu_id" "uuid" NOT NULL,
    "ingredient_id" "uuid" NOT NULL,
    "quantity" numeric(14,3) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "menu_recipes_quantity_check" CHECK (("quantity" > (0)::numeric))
);


ALTER TABLE "public"."menu_recipes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."menus" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "price" integer NOT NULL,
    "stock" integer DEFAULT 0,
    "is_active" boolean DEFAULT true,
    "description" "text",
    "emoji" "text" DEFAULT '📦'::"text",
    "custom_fields" "jsonb" DEFAULT '{}'::"jsonb",
    "niche" "text",
    "image_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."menus" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."niche_flow_catalog" (
    "niche" "text" NOT NULL,
    "flow_type" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "niche_flow_catalog_flow_type_check" CHECK (("flow_type" = ANY (ARRAY['order'::"text", 'booking'::"text", 'service'::"text", 'membership'::"text", 'hybrid'::"text"])))
);


ALTER TABLE "public"."niche_flow_catalog" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "invoice_no" "text" NOT NULL,
    "customer_name" "text" NOT NULL,
    "customer_wa" "text" NOT NULL,
    "items" "jsonb" NOT NULL,
    "subtotal" integer,
    "discount" integer DEFAULT 0,
    "tax" integer DEFAULT 0,
    "total" integer NOT NULL,
    "dp" integer DEFAULT 0,
    "remaining" integer DEFAULT 0,
    "status" "text" DEFAULT 'pending'::"text",
    "niche" "text",
    "pickup_time" timestamp with time zone,
    "custom_text" "text",
    "payment_url" "text",
    "qr_image_url" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "fulfillment_status" "text" DEFAULT 'new'::"text" NOT NULL,
    "idempotency_key" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "orders_fulfillment_status_check" CHECK (("fulfillment_status" = ANY (ARRAY['new'::"text", 'preparing'::"text", 'ready'::"text", 'served'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "orders_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'dp'::"text", 'lunas'::"text", 'batal'::"text", 'baking'::"text", 'ready'::"text", 'delivered'::"text"])))
);


ALTER TABLE "public"."orders" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."payments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "order_id" "uuid",
    "tenant_id" "uuid" NOT NULL,
    "amount" integer NOT NULL,
    "method" "text" DEFAULT 'qris'::"text",
    "provider" "text" DEFAULT 'manual'::"text",
    "provider_order_id" "text",
    "payment_url" "text",
    "qr_string" "text",
    "qr_image_url" "text",
    "status" "text" DEFAULT 'pending'::"text",
    "paid_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "payments_method_check" CHECK (("method" = ANY (ARRAY['qris'::"text", 'gopay'::"text", 'bca_va'::"text", 'bri_va'::"text", 'cash'::"text"]))),
    CONSTRAINT "payments_provider_check" CHECK (("provider" = ANY (ARRAY['midtrans'::"text", 'xendit'::"text", 'manual'::"text"]))),
    CONSTRAINT "payments_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'paid'::"text", 'failed'::"text", 'expired'::"text"])))
);


ALTER TABLE "public"."payments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."promos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "type" "text" DEFAULT 'discount'::"text",
    "value" integer,
    "start_date" "date",
    "end_date" "date",
    "is_active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "promos_type_check" CHECK (("type" = ANY (ARRAY['discount'::"text", 'bundle'::"text", 'free'::"text"])))
);


ALTER TABLE "public"."promos" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rate_limit_state" (
    "subject" "text" NOT NULL,
    "action" "text" NOT NULL,
    "window_start" timestamp with time zone DEFAULT "now"() NOT NULL,
    "count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."rate_limit_state" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_features" (
    "tenant_id" "uuid" NOT NULL,
    "feature_key" "text" NOT NULL,
    "enabled" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_features" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_members" (
    "tenant_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'staff'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_members_role_check" CHECK (("role" = ANY (ARRAY['owner'::"text", 'admin'::"text", 'staff'::"text"])))
);


ALTER TABLE "public"."tenant_members" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_secrets" (
    "tenant_id" "uuid" NOT NULL,
    "google_access_token" "text",
    "google_refresh_token" "text",
    "google_token_expires_at" timestamp with time zone,
    "sheets_spreadsheet_id" "text",
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tenant_secrets" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenant_wa_config" (
    "tenant_id" "uuid" NOT NULL,
    "provider" "text" NOT NULL,
    "phone_number_id" "text" NOT NULL,
    "display_number" "text",
    "webhook_verify_token" "text" NOT NULL,
    "credentials" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "is_active" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tenant_wa_config_provider_check" CHECK (("provider" = ANY (ARRAY['meta_cloud'::"text", '360dialog'::"text", 'twilio'::"text", 'qontak'::"text"])))
);


ALTER TABLE "public"."tenant_wa_config" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tenants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "niche" "text" NOT NULL,
    "owner_name" "text",
    "wa_number" "text",
    "logo_url" "text",
    "subdomain" "text",
    "is_active" boolean DEFAULT true,
    "plan" "text" DEFAULT 'basic'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "flow_type" "text" DEFAULT 'booking'::"text" NOT NULL,
    CONSTRAINT "tenants_flow_type_check" CHECK (("flow_type" = ANY (ARRAY['order'::"text", 'booking'::"text", 'service'::"text", 'membership'::"text", 'hybrid'::"text"]))),
    CONSTRAINT "tenants_niche_check" CHECK (("niche" = ANY (ARRAY['salon'::"text", 'barbershop'::"text", 'resto'::"text", 'gedung'::"text", 'futsal'::"text", 'padel'::"text", 'bakery'::"text", 'car_wash'::"text", 'spa'::"text", 'klinik_kesehatan'::"text", 'klinik_kecantikan'::"text", 'cafe'::"text", 'dental'::"text", 'hotel_villa'::"text", 'rental_kendaraan'::"text", 'laundry'::"text", 'gym'::"text", 'pet_grooming'::"text", 'karaoke'::"text", 'event_organizer'::"text", 'wedding_organizer'::"text", 'kursus'::"text", 'bengkel'::"text", 'travel_tour'::"text"]))),
    CONSTRAINT "tenants_plan_check" CHECK (("plan" = ANY (ARRAY['basic'::"text", 'pro'::"text", 'enterprise'::"text"])))
);


ALTER TABLE "public"."tenants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wa_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "customer_wa" "text" NOT NULL,
    "customer_id" "uuid",
    "flow_type" "text" NOT NULL,
    "current_step" "text" DEFAULT 'greeting'::"text" NOT NULL,
    "context" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "status" "text" DEFAULT 'active'::"text" NOT NULL,
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wa_conversations_flow_type_check" CHECK (("flow_type" = ANY (ARRAY['order'::"text", 'booking'::"text", 'service'::"text", 'membership'::"text", 'hybrid'::"text"]))),
    CONSTRAINT "wa_conversations_status_check" CHECK (("status" = ANY (ARRAY['active'::"text", 'completed'::"text", 'abandoned'::"text", 'handoff_human'::"text"])))
);


ALTER TABLE "public"."wa_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."wa_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "tenant_id" "uuid" NOT NULL,
    "direction" "text" NOT NULL,
    "message_type" "text" DEFAULT 'text'::"text" NOT NULL,
    "body" "text",
    "provider_message_id" "text",
    "raw_payload" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "wa_messages_direction_check" CHECK (("direction" = ANY (ARRAY['inbound'::"text", 'outbound'::"text"]))),
    CONSTRAINT "wa_messages_message_type_check" CHECK (("message_type" = ANY (ARRAY['text'::"text", 'interactive_list'::"text", 'interactive_button'::"text", 'image'::"text", 'template'::"text"])))
);


ALTER TABLE "public"."wa_messages" OWNER TO "postgres";


ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."feature_catalog"
    ADD CONSTRAINT "feature_catalog_pkey" PRIMARY KEY ("key");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_tenant_id_name_key" UNIQUE ("tenant_id", "name");



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menu_recipes"
    ADD CONSTRAINT "menu_recipes_menu_id_ingredient_id_key" UNIQUE ("menu_id", "ingredient_id");



ALTER TABLE ONLY "public"."menu_recipes"
    ADD CONSTRAINT "menu_recipes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."niche_flow_catalog"
    ADD CONSTRAINT "niche_flow_catalog_pkey" PRIMARY KEY ("niche");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_invoice_no_key" UNIQUE ("invoice_no");



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."promos"
    ADD CONSTRAINT "promos_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rate_limit_state"
    ADD CONSTRAINT "rate_limit_state_pkey" PRIMARY KEY ("subject", "action");



ALTER TABLE ONLY "public"."tenant_features"
    ADD CONSTRAINT "tenant_features_pkey" PRIMARY KEY ("tenant_id", "feature_key");



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_pkey" PRIMARY KEY ("tenant_id", "user_id");



ALTER TABLE ONLY "public"."tenant_secrets"
    ADD CONSTRAINT "tenant_secrets_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."tenant_wa_config"
    ADD CONSTRAINT "tenant_wa_config_pkey" PRIMARY KEY ("tenant_id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tenants"
    ADD CONSTRAINT "tenants_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."wa_conversations"
    ADD CONSTRAINT "wa_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."wa_messages"
    ADD CONSTRAINT "wa_messages_pkey" PRIMARY KEY ("id");



CREATE INDEX "audit_logs_tenant_idx" ON "public"."audit_logs" USING "btree" ("tenant_id");



CREATE INDEX "customers_tenant_idx" ON "public"."customers" USING "btree" ("tenant_id");



CREATE INDEX "ingredients_tenant_idx" ON "public"."ingredients" USING "btree" ("tenant_id", "is_active", "name");



CREATE INDEX "inventory_tx_tenant_idx" ON "public"."inventory_transactions" USING "btree" ("tenant_id", "created_at" DESC);



CREATE INDEX "orders_tenant_fulfillment_idx" ON "public"."orders" USING "btree" ("tenant_id", "fulfillment_status", "created_at");



CREATE UNIQUE INDEX "orders_tenant_idempotency_key_idx" ON "public"."orders" USING "btree" ("tenant_id", "idempotency_key") WHERE ("idempotency_key" IS NOT NULL);



CREATE INDEX "payments_order_idx" ON "public"."payments" USING "btree" ("order_id");



CREATE UNIQUE INDEX "payments_order_pending_unique" ON "public"."payments" USING "btree" ("order_id") WHERE ("status" = 'pending'::"text");



CREATE INDEX "payments_tenant_idx" ON "public"."payments" USING "btree" ("tenant_id");



CREATE INDEX "recipes_menu_idx" ON "public"."menu_recipes" USING "btree" ("tenant_id", "menu_id");



CREATE INDEX "tenant_members_user_idx" ON "public"."tenant_members" USING "btree" ("user_id");



CREATE UNIQUE INDEX "tenant_wa_config_phone_idx" ON "public"."tenant_wa_config" USING "btree" ("phone_number_id");



CREATE UNIQUE INDEX "wa_conversations_active_idx" ON "public"."wa_conversations" USING "btree" ("tenant_id", "customer_wa") WHERE ("status" = 'active'::"text");



CREATE INDEX "wa_conversations_tenant_idx" ON "public"."wa_conversations" USING "btree" ("tenant_id", "last_message_at" DESC);



CREATE INDEX "wa_messages_conversation_idx" ON "public"."wa_messages" USING "btree" ("conversation_id", "created_at");



CREATE OR REPLACE TRIGGER "orders_recipe_inventory_after" AFTER INSERT OR UPDATE OF "status" ON "public"."orders" FOR EACH ROW EXECUTE FUNCTION "public"."orders_recipe_inventory_trigger"();



ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."bookings"
    ADD CONSTRAINT "bookings_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."chats"
    ADD CONSTRAINT "chats_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."customers"
    ADD CONSTRAINT "customers_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."ingredients"
    ADD CONSTRAINT "ingredients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."inventory_transactions"
    ADD CONSTRAINT "inventory_transactions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_recipes"
    ADD CONSTRAINT "menu_recipes_ingredient_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_recipes"
    ADD CONSTRAINT "menu_recipes_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menu_recipes"
    ADD CONSTRAINT "menu_recipes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."menus"
    ADD CONSTRAINT "menus_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."orders"
    ADD CONSTRAINT "orders_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."payments"
    ADD CONSTRAINT "payments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."promos"
    ADD CONSTRAINT "promos_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_features"
    ADD CONSTRAINT "tenant_features_feature_key_fkey" FOREIGN KEY ("feature_key") REFERENCES "public"."feature_catalog"("key");



ALTER TABLE ONLY "public"."tenant_features"
    ADD CONSTRAINT "tenant_features_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_members"
    ADD CONSTRAINT "tenant_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_secrets"
    ADD CONSTRAINT "tenant_secrets_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."tenant_wa_config"
    ADD CONSTRAINT "tenant_wa_config_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wa_conversations"
    ADD CONSTRAINT "wa_conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."wa_conversations"
    ADD CONSTRAINT "wa_conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wa_messages"
    ADD CONSTRAINT "wa_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."wa_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."wa_messages"
    ADD CONSTRAINT "wa_messages_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE CASCADE;



ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_member_read" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



CREATE POLICY "audit_server_insert" ON "public"."audit_logs" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."bookings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "bookings_member_read" ON "public"."bookings" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



CREATE POLICY "bookings_staff_update" ON "public"."bookings" FOR UPDATE TO "authenticated" USING ("public"."is_tenant_member"("tenant_id")) WITH CHECK ("public"."is_tenant_member"("tenant_id"));



CREATE POLICY "bookings_staff_write" ON "public"."bookings" FOR INSERT TO "authenticated" WITH CHECK ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."chats" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "chats_member" ON "public"."chats" TO "authenticated" USING ("public"."is_tenant_member"("tenant_id")) WITH CHECK ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."customers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "customers_member" ON "public"."customers" TO "authenticated" USING ("public"."is_tenant_member"("tenant_id")) WITH CHECK ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."feature_catalog" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "feature_catalog_public_read" ON "public"."feature_catalog" FOR SELECT TO "authenticated", "anon" USING (true);



ALTER TABLE "public"."ingredients" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ingredients_member_read" ON "public"."ingredients" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



CREATE POLICY "inventory_member_read" ON "public"."inventory_transactions" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



CREATE POLICY "inventory_server_write" ON "public"."inventory_transactions" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."inventory_transactions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menu_recipes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."menus" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "menus_admin_write" ON "public"."menus" TO "authenticated" USING ("public"."is_tenant_admin"("tenant_id")) WITH CHECK ("public"."is_tenant_admin"("tenant_id"));



CREATE POLICY "menus_member_read" ON "public"."menus" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."orders" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "orders_admin_write" ON "public"."orders" TO "authenticated" USING ("public"."is_tenant_admin"("tenant_id")) WITH CHECK ("public"."is_tenant_admin"("tenant_id"));



CREATE POLICY "orders_member_read" ON "public"."orders" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "payments_member_read" ON "public"."payments" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



CREATE POLICY "payments_server_update" ON "public"."payments" FOR UPDATE TO "service_role" USING (true) WITH CHECK (true);



CREATE POLICY "payments_server_write" ON "public"."payments" FOR INSERT TO "service_role" WITH CHECK (true);



ALTER TABLE "public"."promos" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "promos_admin" ON "public"."promos" TO "authenticated" USING ("public"."is_tenant_admin"("tenant_id")) WITH CHECK ("public"."is_tenant_admin"("tenant_id"));



CREATE POLICY "promos_member_read" ON "public"."promos" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."rate_limit_state" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "recipes_member_read" ON "public"."menu_recipes" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."tenant_features" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_features_admin_write" ON "public"."tenant_features" TO "authenticated" USING ("public"."is_tenant_admin"("tenant_id")) WITH CHECK ("public"."is_tenant_admin"("tenant_id"));



CREATE POLICY "tenant_features_member_read" ON "public"."tenant_features" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."tenant_members" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenant_members_self_read" ON "public"."tenant_members" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."tenant_secrets" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenant_wa_config" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."tenants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tenants_public_discovery" ON "public"."tenants" FOR SELECT TO "authenticated", "anon" USING (("is_active" = true));



ALTER TABLE "public"."wa_conversations" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wa_conversations_member_read" ON "public"."wa_conversations" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));



ALTER TABLE "public"."wa_messages" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "wa_messages_member_read" ON "public"."wa_messages" FOR SELECT TO "authenticated" USING ("public"."is_tenant_member"("tenant_id"));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































REVOKE ALL ON FUNCTION "public"."admin_create_ingredient"("p_ingredient" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_create_ingredient"("p_ingredient" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_create_ingredient"("p_ingredient" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_delete_recipe"("p_recipe_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_delete_recipe"("p_recipe_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_delete_recipe"("p_recipe_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_customer"("p_customer" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_customer"("p_customer" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_customer"("p_customer" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_menu"("p_menu" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_menu"("p_menu" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_menu"("p_menu" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."admin_upsert_recipe"("p_recipe" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."admin_upsert_recipe"("p_recipe" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."admin_upsert_recipe"("p_recipe" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."attach_midtrans_details_atomic"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_payment_url" "text", "p_qr_string" "text", "p_qr_image_url" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."attach_midtrans_details_atomic"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_payment_url" "text", "p_qr_string" "text", "p_qr_image_url" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."book_slot_atomic"("p_booking" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."book_slot_atomic"("p_booking" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."book_slot_atomic"("p_booking" "jsonb") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bot_create_order_atomic"("p_tenant_id" "uuid", "p_customer_wa" "text", "p_customer_name" "text", "p_items" "jsonb", "p_conversation_id" "uuid", "p_idempotency_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bot_create_order_atomic"("p_tenant_id" "uuid", "p_customer_wa" "text", "p_customer_name" "text", "p_items" "jsonb", "p_conversation_id" "uuid", "p_idempotency_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bot_create_order_atomic"("p_tenant_id" "uuid", "p_customer_wa" "text", "p_customer_name" "text", "p_items" "jsonb", "p_conversation_id" "uuid", "p_idempotency_key" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."bot_record_cash_payment"("p_tenant_id" "uuid", "p_order_id" "uuid", "p_amount" bigint, "p_conversation_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."bot_record_cash_payment"("p_tenant_id" "uuid", "p_order_id" "uuid", "p_amount" bigint, "p_conversation_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."bot_record_cash_payment"("p_tenant_id" "uuid", "p_order_id" "uuid", "p_amount" bigint, "p_conversation_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_booking_atomic"("p_booking_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_booking_atomic"("p_booking_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_booking_atomic"("p_booking_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."cancel_order_atomic"("p_order_id" "uuid", "p_reason" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."cancel_order_atomic"("p_order_id" "uuid", "p_reason" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."cancel_order_atomic"("p_order_id" "uuid", "p_reason" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."check_rate_limit"("p_subject" "text", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."check_rate_limit"("p_subject" "text", "p_action" "text", "p_limit" integer, "p_window_seconds" integer) TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_registration_from_metadata"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_registration_from_metadata"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."complete_registration_from_metadata"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."consume_recipe_for_order"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."consume_recipe_for_order"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."create_order_atomic"("p_tenant_id" "uuid", "p_customer_name" "text", "p_customer_wa" "text", "p_items" "jsonb", "p_discount" integer, "p_tax" integer, "p_pickup_time" timestamp with time zone, "p_custom_text" "text", "p_idempotency_key" "text", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_order_atomic"("p_tenant_id" "uuid", "p_customer_name" "text", "p_customer_wa" "text", "p_items" "jsonb", "p_discount" integer, "p_tax" integer, "p_pickup_time" timestamp with time zone, "p_custom_text" "text", "p_idempotency_key" "text", "p_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tenant_admin"("target_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("target_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_admin"("target_tenant" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_tenant_member"("target_tenant" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_tenant_member"("target_tenant" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_tenant_member"("target_tenant" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."kitchen_update_order_status"("p_order_id" "uuid", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."kitchen_update_order_status"("p_order_id" "uuid", "p_status" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."kitchen_update_order_status"("p_order_id" "uuid", "p_status" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."mark_payment_paid"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_amount" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."mark_payment_paid"("p_payment_id" "uuid", "p_provider_order_id" "text", "p_amount" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."orders_recipe_inventory_trigger"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."orders_recipe_inventory_trigger"() TO "service_role";



REVOKE ALL ON FUNCTION "public"."record_cash_payment"("p_order_id" "uuid", "p_amount" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."record_cash_payment"("p_order_id" "uuid", "p_amount" bigint) TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_cash_payment"("p_order_id" "uuid", "p_amount" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."register_tenant_atomic"("p_tenant_name" "text", "p_slug" "text", "p_niche" "text", "p_owner_name" "text", "p_wa_number" "text", "p_features" "text"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."register_tenant_atomic"("p_tenant_name" "text", "p_slug" "text", "p_niche" "text", "p_owner_name" "text", "p_wa_number" "text", "p_features" "text"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."register_tenant_atomic"("p_tenant_name" "text", "p_slug" "text", "p_niche" "text", "p_owner_name" "text", "p_wa_number" "text", "p_features" "text"[]) TO "service_role";



REVOKE ALL ON FUNCTION "public"."reserve_pending_payment_atomic"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" bigint) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reserve_pending_payment_atomic"("p_order_id" "uuid", "p_tenant_id" "uuid", "p_amount" bigint) TO "service_role";



REVOKE ALL ON FUNCTION "public"."restock_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric, "p_note" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restock_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric, "p_note" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."restock_ingredient"("p_ingredient_id" "uuid", "p_quantity" numeric, "p_note" "text") TO "service_role";



REVOKE ALL ON FUNCTION "public"."restore_recipe_for_cancel"("p_order_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."restore_recipe_for_cancel"("p_order_id" "uuid") TO "service_role";



REVOKE ALL ON FUNCTION "public"."write_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_old_value" "jsonb", "p_new_value" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."write_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_old_value" "jsonb", "p_new_value" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."write_audit_log"("p_tenant_id" "uuid", "p_action" "text", "p_entity" "text", "p_entity_id" "text", "p_old_value" "jsonb", "p_new_value" "jsonb") TO "service_role";


















GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";



GRANT ALL ON TABLE "public"."bookings" TO "anon";
GRANT ALL ON TABLE "public"."bookings" TO "authenticated";
GRANT ALL ON TABLE "public"."bookings" TO "service_role";



GRANT ALL ON TABLE "public"."chats" TO "anon";
GRANT ALL ON TABLE "public"."chats" TO "authenticated";
GRANT ALL ON TABLE "public"."chats" TO "service_role";



GRANT ALL ON TABLE "public"."customers" TO "anon";
GRANT ALL ON TABLE "public"."customers" TO "authenticated";
GRANT ALL ON TABLE "public"."customers" TO "service_role";



GRANT ALL ON TABLE "public"."feature_catalog" TO "anon";
GRANT ALL ON TABLE "public"."feature_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."feature_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."ingredients" TO "anon";
GRANT ALL ON TABLE "public"."ingredients" TO "authenticated";
GRANT ALL ON TABLE "public"."ingredients" TO "service_role";



GRANT ALL ON TABLE "public"."inventory_transactions" TO "anon";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "authenticated";
GRANT ALL ON TABLE "public"."inventory_transactions" TO "service_role";



GRANT ALL ON TABLE "public"."menu_recipes" TO "anon";
GRANT ALL ON TABLE "public"."menu_recipes" TO "authenticated";
GRANT ALL ON TABLE "public"."menu_recipes" TO "service_role";



GRANT ALL ON TABLE "public"."menus" TO "anon";
GRANT ALL ON TABLE "public"."menus" TO "authenticated";
GRANT ALL ON TABLE "public"."menus" TO "service_role";



GRANT ALL ON TABLE "public"."niche_flow_catalog" TO "anon";
GRANT ALL ON TABLE "public"."niche_flow_catalog" TO "authenticated";
GRANT ALL ON TABLE "public"."niche_flow_catalog" TO "service_role";



GRANT ALL ON TABLE "public"."orders" TO "anon";
GRANT ALL ON TABLE "public"."orders" TO "authenticated";
GRANT ALL ON TABLE "public"."orders" TO "service_role";



GRANT ALL ON TABLE "public"."payments" TO "anon";
GRANT ALL ON TABLE "public"."payments" TO "authenticated";
GRANT ALL ON TABLE "public"."payments" TO "service_role";



GRANT ALL ON TABLE "public"."promos" TO "anon";
GRANT ALL ON TABLE "public"."promos" TO "authenticated";
GRANT ALL ON TABLE "public"."promos" TO "service_role";



GRANT ALL ON TABLE "public"."rate_limit_state" TO "anon";
GRANT ALL ON TABLE "public"."rate_limit_state" TO "authenticated";
GRANT ALL ON TABLE "public"."rate_limit_state" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_features" TO "anon";
GRANT ALL ON TABLE "public"."tenant_features" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_features" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_members" TO "anon";
GRANT ALL ON TABLE "public"."tenant_members" TO "authenticated";
GRANT ALL ON TABLE "public"."tenant_members" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_secrets" TO "service_role";



GRANT ALL ON TABLE "public"."tenant_wa_config" TO "service_role";



GRANT ALL ON TABLE "public"."tenants" TO "anon";
GRANT ALL ON TABLE "public"."tenants" TO "authenticated";
GRANT ALL ON TABLE "public"."tenants" TO "service_role";



GRANT ALL ON TABLE "public"."wa_conversations" TO "anon";
GRANT ALL ON TABLE "public"."wa_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."wa_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."wa_messages" TO "anon";
GRANT ALL ON TABLE "public"."wa_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."wa_messages" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































