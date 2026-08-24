-- AIWAKU V5.8 — Self-service registration: niche baru + feature selection
-- Apply after 20260823_v57_payment_race_ratelimit_and_orderfix.sql
--
-- KEPUTUSAN PRODUK (didokumentasikan, bukan asumsi):
-- 1) "Booking" dan "Reservasi" digabung jadi satu feature key `booking`
--    (label: "Booking / Reservasi") karena secara fungsional keduanya
--    memakai tabel & halaman yang sama (Bookings.tsx / booking_slots).
--    Kalau ke depannya reservasi butuh alur beda (mis. approval manual),
--    pisahkan jadi feature key baru + halaman baru, jangan overload
--    `booking` yang sudah ada.
-- 2) "Antrian" (queue management) BELUM punya halaman/route di aplikasi
--    ini. Feature key `queue` didaftarkan di katalog supaya bisa dipilih
--    saat registrasi dan tersimpan sebagai preferensi tenant, TAPI tidak
--    di-gate ke route manapun karena route-nya belum ada. Jangan anggap
--    ini fitur yang sudah jalan — ini placeholder sampai halaman Antrian
--    dibangun.
-- 3) Core features (`pos`, `menu`, dashboard, settings) TIDAK masuk
--    tenant_features — selalu aktif untuk semua tenant, tidak bisa
--    dimatikan lewat registrasi. Ini konsisten dengan app saat ini yang
--    tidak punya guard untuk /pos, /menu, /, /settings.

-- ============================================================
-- 1) Expand niche check constraint (tanpa drop tenants table)
-- ============================================================
alter table public.tenants drop constraint if exists tenants_niche_check;
alter table public.tenants add constraint tenants_niche_check
  check (niche in (
    'salon','barbershop','resto','gedung','futsal','padel','bakery',
    'car_wash','spa','klinik_kesehatan','klinik_kecantikan'
  ));

-- ============================================================
-- 2) Feature catalog (daftar tetap, dikelola lewat migration baru,
--    bukan lewat UI admin)
-- ============================================================
create table if not exists public.feature_catalog (
  key text primary key,
  label text not null,
  description text,
  sort_order int not null default 0,
  is_available boolean not null default true -- false = placeholder, belum ada halaman
);

insert into public.feature_catalog (key, label, description, sort_order, is_available) values
  ('inventory', 'Persediaan', 'Kelola stok bahan baku & resep', 10, true),
  ('kds', 'Kitchen Display', 'Layar dapur untuk status pesanan', 20, true),
  ('tables', 'Meja', 'Manajemen meja untuk dine-in', 30, true),
  ('booking', 'Booking / Reservasi', 'Booking slot lapangan, ruangan, atau jadwal layanan', 40, true),
  ('queue', 'Antrian', 'Manajemen antrian pelanggan (segera hadir)', 45, false),
  ('customers', 'Pelanggan', 'Database pelanggan & riwayat transaksi', 50, true),
  ('reports', 'Laporan Bisnis', 'Ringkasan penjualan & performa bisnis', 60, true),
  ('calendar', 'Kalender', 'Sinkronisasi jadwal ke Google Calendar', 70, true),
  ('catalog', 'Katalog Online', 'Halaman katalog produk untuk dibagikan ke pelanggan', 80, true)
on conflict (key) do update set
  label = excluded.label,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_available = excluded.is_available;

alter table public.feature_catalog enable row level security;
drop policy if exists feature_catalog_public_read on public.feature_catalog;
create policy feature_catalog_public_read on public.feature_catalog
  for select to anon, authenticated using (true);

-- ============================================================
-- 3) tenant_features — fitur opsional yang aktif per tenant
-- ============================================================
create table if not exists public.tenant_features (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  feature_key text not null references public.feature_catalog(key),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (tenant_id, feature_key)
);

alter table public.tenant_features enable row level security;

drop policy if exists tenant_features_member_read on public.tenant_features;
create policy tenant_features_member_read on public.tenant_features
  for select to authenticated
  using (public.is_tenant_member(tenant_id));

drop policy if exists tenant_features_admin_write on public.tenant_features;
create policy tenant_features_admin_write on public.tenant_features
  for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id));

-- ============================================================
-- 4) RPC: register_tenant_atomic
--    Dipanggil dari client SETELAH supabase.auth.signUp() sukses dan
--    session sudah ada (jadi auth.uid() terisi). Membuat tenant, owner
--    membership, dan tenant_features dalam satu transaksi.
-- ============================================================
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
begin
  if v_user is null then
    raise exception 'Unauthorized';
  end if;

  if p_tenant_name is null or trim(p_tenant_name) = '' then
    raise exception 'Nama usaha wajib diisi';
  end if;

  if v_clean_slug !~ '^[a-z0-9-]{3,50}$' then
    raise exception 'Slug harus 3-50 karakter, huruf kecil/angka/dash saja';
  end if;

  if exists (select 1 from tenants where slug = v_clean_slug) then
    raise exception 'Slug sudah dipakai, pilih yang lain';
  end if;

  -- niche divalidasi lewat constraint tenants_niche_check di insert ini juga,
  -- tapi dicek eksplisit dulu supaya pesan errornya jelas untuk user.
  if p_niche not in (
    'salon','barbershop','resto','gedung','futsal','padel','bakery',
    'car_wash','spa','klinik_kesehatan','klinik_kecantikan'
  ) then
    raise exception 'Jenis usaha tidak valid';
  end if;

  insert into tenants (id, slug, name, niche, owner_name, wa_number, is_active, plan)
  values (v_tenant_id, v_clean_slug, trim(p_tenant_name), p_niche, p_owner_name, p_wa_number, true, 'basic');

  insert into tenant_members (tenant_id, user_id, role)
  values (v_tenant_id, v_user, 'owner');

  -- Hanya simpan feature yang valid & tersedia (is_available = true).
  -- Feature placeholder (mis. `queue`) tetap boleh dipilih user dan
  -- disimpan sebagai preferensi, tapi tidak memblokir apapun karena
  -- belum ada halaman yang mengecek key tsb.
  foreach v_feature in array coalesce(p_features, '{}')
  loop
    if exists (select 1 from feature_catalog where key = v_feature) then
      insert into tenant_features (tenant_id, feature_key, enabled)
      values (v_tenant_id, v_feature, true)
      on conflict (tenant_id, feature_key) do nothing;
    end if;
  end loop;

  return jsonb_build_object('tenant_id', v_tenant_id, 'slug', v_clean_slug);
end;
$$;

revoke all on function public.register_tenant_atomic(text,text,text,text,text,text[]) from public;
grant execute on function public.register_tenant_atomic(text,text,text,text,text,text[]) to authenticated;
