
-- aiwaku BACKEND SCHEMA v1 - Supabase Singapore
-- Run this in Supabase SQL Editor

-- 1. TENANTS (1 domain, 50 tenant)
create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null, -- app.aiwaku.id/t/bakery-sari
  name text not null,
  niche text not null check (niche in ('salon','barbershop','resto','gedung','futsal','padel','bakery')),
  owner_name text,
  wa_number text,
  logo_url text,
  subdomain text, -- bakery-sari.aiwaku.id (optional)
  is_active boolean default true,
  plan text default 'basic' check (plan in ('basic','pro','enterprise')),
  created_at timestamptz default now()
);

-- 2. MENUS (Bakery, Resto, Padel slot, etc)
create table if not exists menus (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  name text not null,
  price int not null, -- in IDR
  stock int default 0,
  is_active boolean default true,
  description text,
  emoji text default '📦',
  custom_fields jsonb default '{}'::jsonb, -- {tulisan_kue, ukuran, level_pedas, jam_main}
  niche text,
  image_url text,
  created_at timestamptz default now()
);
create index on menus(tenant_id);
create index on menus(is_active);

-- 3. ORDERS / INVOICES (Bakery order + Padel booking + Salon)
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  invoice_no text unique not null, -- INV-AIW-001
  customer_name text not null,
  customer_wa text not null,
  items jsonb not null, -- [{menu_id, name, qty, price}]
  subtotal int,
  discount int default 0,
  tax int default 0,
  total int not null,
  dp int default 0,
  remaining int default 0,
  status text default 'pending' check (status in ('pending','dp','lunas','batal','baking','ready','delivered')),
  niche text,
  pickup_time timestamptz,
  custom_text text, -- tulisan kue, catatan
  payment_url text,
  qr_image_url text,
  notes text,
  created_at timestamptz default now()
);
create index on orders(tenant_id);
create index on orders(created_at);

-- 4. BOOKINGS (for Padel, Futsal, Gedung, Salon)
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  date date not null,
  start_time time not null,
  end_time time not null,
  field_no text, -- Lapangan 1, Room A
  customer_name text,
  customer_wa text,
  status text default 'booked' check (status in ('booked','selesai','batal')),
  created_at timestamptz default now()
);

-- 5. CHATS (WA + Web)
create table if not exists chats (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  customer_wa text not null,
  customer_name text,
  messages jsonb default '[]'::jsonb, -- [{role, text, time}]
  ai_active boolean default true,
  last_message_at timestamptz default now()
);

-- 6. PROMOS
create table if not exists promos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  name text not null,
  type text default 'discount' check (type in ('discount','bundle','free')),
  value int, -- 10000 or 10%
  start_date date,
  end_date date,
  is_active boolean default true,
  created_at timestamptz default now()
);

-- 7. Enable RLS
alter table tenants enable row level security;
alter table menus enable row level security;
alter table orders enable row level security;
alter table bookings enable row level security;
alter table chats enable row level security;
alter table promos enable row level security;

-- RLS: for MVP, allow all for anon/authenticated (nanti per-tenant via JWT)
create policy "Allow all for MVP" on tenants for all using (true) with check (true);
create policy "Allow all for MVP" on menus for all using (true) with check (true);
create policy "Allow all for MVP" on orders for all using (true) with check (true);
create policy "Allow all for MVP" on bookings for all using (true) with check (true);
create policy "Allow all for MVP" on chats for all using (true) with check (true);
create policy "Allow all for MVP" on promos for all using (true) with check (true);

-- Seed 1 tenant demo (Bakery Sari Harapan Indah)
insert into tenants (slug, name, niche, owner_name, wa_number) values 
('bakery-sari', 'Bakery Sari - Harapan Indah', 'bakery', 'Bu Sari', '62812xxxx')
on conflict (slug) do nothing;

-- Customers for P1
create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  name text not null,
  wa text not null,
  email text,
  notes text,
  total_orders int default 0,
  total_spent int default 0,
  last_order_at timestamptz,
  tags text[] default '{}',
  created_at timestamptz default now()
);
alter table customers enable row level security;
create policy "Allow all for MVP" on customers for all using (true) with check (true);
create index on customers(tenant_id);

-- 8. PAYMENTS (dipakai src/lib/payment.ts - sebelumnya tabel ini belum ada)
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references orders(id) on delete cascade,
  tenant_id uuid references tenants(id) on delete cascade not null,
  amount int not null,
  method text default 'qris' check (method in ('qris','gopay','bca_va','bri_va','cash')),
  provider text default 'manual' check (provider in ('midtrans','xendit','manual')),
  provider_order_id text,
  payment_url text,
  qr_string text,
  qr_image_url text,
  status text default 'pending' check (status in ('pending','paid','failed','expired')),
  paid_at timestamptz,
  created_at timestamptz default now()
);
alter table payments enable row level security;
create policy "Allow all for MVP" on payments for all using (true) with check (true);
create index on payments(tenant_id);
create index on payments(order_id);

-- 9. AUDIT LOGS (dipakai src/lib/auditLog.ts)
create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade not null,
  action text not null,
  entity text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  "user" text default 'admin',
  "timestamp" timestamptz default now()
);
alter table audit_logs enable row level security;
create policy "Allow all for MVP" on audit_logs for all using (true) with check (true);
create index on audit_logs(tenant_id);

-- 10. BOOKINGS extra columns (selaras dengan tipe BookingSlot di frontend)
alter table bookings add column if not exists price int default 0;
alter table bookings add column if not exists customer_id uuid;
alter table bookings add column if not exists order_id uuid;
