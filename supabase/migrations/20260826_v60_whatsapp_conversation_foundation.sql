-- AIWAKU V6.0 — WhatsApp Automation Foundation (DESAIN, provider belum dipilih)
-- Apply after 20260825_v59_niche_expansion.sql
--
-- STATUS: Ini fondasi skema + RPC untuk conversation engine WhatsApp.
-- BELUM ADA provider terpasang (Meta Cloud API / Twilio / Qontak belum
-- diputuskan). Tabel & RPC di sini provider-agnostic secara desain —
-- kolom provider spesifik (access token dll) disimpan sebagai jsonb
-- generik supaya tidak perlu migration ulang begitu provider dipilih.
--
-- JANGAN dianggap sudah bisa terima pesan WhatsApp asli. Edge function
-- `wa-webhook` yang benar-benar bicara ke Meta/Twilio/Qontak BELUM
-- ditulis — itu langkah berikutnya setelah provider dipilih, karena
-- format payload webhook beda-beda per provider dan tidak bisa ditulis
-- benar tanpa dokumentasi API resmi mereka di tangan.

-- ============================================================
-- 1) tenant_wa_config — kredensial WA per tenant.
--    Sama seperti tenant_secrets: TIDAK PERNAH boleh diakses dari
--    anon/authenticated. Hanya service_role (dipanggil dari edge
--    function) yang boleh baca/tulis.
-- ============================================================
create table if not exists public.tenant_wa_config (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  provider text not null check (provider in ('meta_cloud','twilio','qontak')),
  phone_number_id text not null, -- ID nomor WA di sisi provider (dipakai buat routing inbound ke tenant yang benar)
  display_number text,
  webhook_verify_token text not null,
  credentials jsonb not null default '{}'::jsonb, -- access token dll, bentuk beda per provider, JANGAN log isi kolom ini
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists tenant_wa_config_phone_idx on public.tenant_wa_config(phone_number_id);

alter table public.tenant_wa_config enable row level security;
revoke all on table public.tenant_wa_config from anon, authenticated;
-- Tidak ada policy untuk anon/authenticated sama sekali -> hanya service_role
-- (yang bypass RLS) yang bisa akses. Ini disengaja.

-- ============================================================
-- 2) wa_conversations — satu baris per sesi percakapan customer.
--    `context` menyimpan state flow (item yang dipilih, slot yang
--    dipilih, dsb) sebagai jsonb bebas bentuk, supaya flow engine bisa
--    berkembang tanpa migration schema tiap kali nambah field baru.
-- ============================================================
create table if not exists public.wa_conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  customer_wa text not null,
  customer_id uuid references public.customers(id) on delete set null,
  flow_type text not null check (flow_type in ('order','booking')),
  current_step text not null default 'greeting',
  context jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active','completed','abandoned','handoff_human')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Maksimal satu percakapan AKTIF per (tenant, nomor WA) — kalau customer
-- chat lagi setelah selesai/abandoned, dibuat baris baru, bukan reuse.
create unique index if not exists wa_conversations_active_idx
  on public.wa_conversations(tenant_id, customer_wa) where (status = 'active');

create index if not exists wa_conversations_tenant_idx on public.wa_conversations(tenant_id, last_message_at desc);

alter table public.wa_conversations enable row level security;
drop policy if exists wa_conversations_member_read on public.wa_conversations;
create policy wa_conversations_member_read on public.wa_conversations
  for select to authenticated
  using (public.is_tenant_member(tenant_id));
-- Tidak ada policy insert/update untuk authenticated/anon — hanya
-- service_role (edge function wa-webhook) yang menulis ke tabel ini.

-- ============================================================
-- 3) wa_messages — log semua pesan masuk/keluar, buat histori &
--    debugging flow engine. tenant_id didenormalisasi supaya RLS
--    read-nya tidak perlu join ke wa_conversations tiap query.
-- ============================================================
create table if not exists public.wa_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.wa_conversations(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  direction text not null check (direction in ('inbound','outbound')),
  message_type text not null default 'text' check (message_type in ('text','interactive_list','interactive_button','image','template')),
  body text,
  provider_message_id text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wa_messages_conversation_idx on public.wa_messages(conversation_id, created_at);

alter table public.wa_messages enable row level security;
drop policy if exists wa_messages_member_read on public.wa_messages;
create policy wa_messages_member_read on public.wa_messages
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

-- ============================================================
-- 4) RPC khusus bot: create_order_atomic & book_slot_atomic yang ada
--    sekarang mensyaratkan auth.uid() ada di tenant_members (staff
--    login). Customer WhatsApp BUKAN staff dan tidak punya session
--    Supabase — jadi butuh jalur terpisah yang:
--      a) TIDAK cek tenant_members (tidak relevan buat customer luar)
--      b) HANYA bisa dipanggil service_role (gerbang keamanannya
--         adalah verifikasi signature webhook di edge function,
--         BUKAN RLS/auth.uid() Supabase)
--    Jangan grant fungsi ini ke `authenticated` — itu akan jadi celah
--    yang membolehkan siapapun yang login bikin order tanpa jadi staff.
-- ============================================================
create or replace function public.bot_create_order_atomic(
  p_tenant_id uuid,
  p_customer_wa text,
  p_customer_name text,
  p_items jsonb,
  p_conversation_id uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.bot_create_order_atomic(uuid,text,text,jsonb,uuid,text) from public;
grant execute on function public.bot_create_order_atomic(uuid,text,text,jsonb,uuid,text) to service_role;

-- NOTE: bot_book_slot_atomic (padanan untuk flow_type='booking') sengaja
-- BELUM ditulis di migration ini. Pola-nya akan sama seperti di atas
-- (adaptasi dari book_slot_atomic yang sudah ada, tanpa cek tenant_members,
-- grant ke service_role saja) — ditulis begitu flow booking di flow engine
-- sudah stabil, supaya tidak menulis RPC yang bentuk parameternya keburu
-- berubah lagi.
