
# AIWAKU V5.7 — Consolidated Production/Staging Candidate

## Status terkini (V5.7 — H1 Inventory Mutation Boundary)

**STATUS: PARTIAL — implementation ready, runtime verification blocked.**

- Static source verification: **PASS** (lihat `RELEASE_GATE.md`)
- Environment verification (`npm ci`, typecheck, test, build, staging migration,
  RLS isolation, concurrency/idempotency test): **belum dijalankan**
- Detail lengkap: `AIWAKU-V5.7-H1-INVENTORY-IMPLEMENTATION-REPORT.md`,
  `AIWAKU-V5.7-INVENTORY-MUTATION-CONTRACT-v1.1.md`, `RELEASE_GATE.md`

Jangan anggap H1 DONE sebelum semua item Environment Gate di `RELEASE_GATE.md` tercentang.

## Cara deploy dari HP (tanpa terminal lokal)

Repo ini belum pernah di-deploy. Karena development dilakukan dari HP, gunakan
GitHub Codespaces sebagai terminal cloud (buka lewat browser HP):

1. **GitHub** — buat repo kosong, buka **Code → Codespaces → Create codespace on main**,
   upload/extract project ini, lalu `git add -A && git commit -m "..." && git push`.
2. **CI otomatis** — `.github/workflows/ci.yml` akan menjalankan
   `npm ci → typecheck → test → build` setiap push. Cek tab **Actions** di GitHub.
3. **Vercel** — New Project → Import repo ini. Build (`npm run build`) berjalan
   otomatis di setiap push, memenuhi item "Production build" di Environment Gate.
4. **Supabase** — buat project baru, jalankan migration secara berurutan lewat
   **SQL Editor** (lihat urutan di `supabase/PHASE3_MIGRATION_ORDER.md` /
   `PHASE4_MIGRATION_ORDER.md`), lalu set `VITE_SUPABASE_URL` dan
   `VITE_SUPABASE_ANON_KEY` di Vercel env vars.
5. Sisa item Environment Gate (tenant isolation, concurrency, cancellation test)
   dijalankan lewat Codespaces yang sama, mengarah ke Supabase staging.

## Cara jalan

```bash
npm install
npm run dev
# -> http://localhost:5173
```

- `/` atau `/t/bakery-sari` = Dashboard
- `/menu` = Menu & Stok (stock ≠ is_active)
- `/invoices` = Invoice engine + QRIS + PDF + WA + Calendar + Sheets
- `/bookings` = Booking engine grid lapangan x jam
- `/calendar` = Agenda booking + tombol Google Calendar
- `/customers` = Customer DB
- `/admin` = Admin Chat OS (intent parser)
- `/settings` = Integrasi QRIS static / Google Calendar / Sheets URL + audit log

Routing memakai HashRouter agar deep link & refresh tetap jalan di hosting statis
tanpa rewrite rule.

## Deploy

Vercel/Netlify → import repo → build `npm run build` → output `dist`.
Env opsional (fallback localStorage + demo QRIS jika kosong):

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- Di Supabase: jalankan `supabase/schema.sql`, deploy functions
  `create-payment`, `sync-calendar`, `sync-sheets`
- `MIDTRANS_SERVER_KEY` (di env Edge Function) untuk QRIS dinamis production

## Changelog V5.1 (review & perbaikan)

Bug yang diperbaiki:

1. **Booking korupsi data saat ganti tanggal** — `useBookings` tidak me-load ulang
   slot saat tanggal berubah dan malah menimpa storage tanggal baru dengan slot
   tanggal lama. Sekarang load-per-tanggal + guard saat simpan.
2. **Crash alur P2 di Invoice** — `pickup_time` hardcoded non-ISO membuat
   `new Date()` Invalid Date dan `toISOString()` melempar RangeError, memutus
   QRIS + Calendar + Sheets sekaligus. Sekarang ISO valid + tiap integrasi
   dibungkus try/catch independen.
3. **Intent parser UPDATE_PRICE** — "naikkan harga facial glowing jadi 275 ribu"
   menangkap nama "harga facial glowing" sehingga produk tidak pernah ketemu.
   Kata pengisi sekarang dibuang.
4. **Import rusak di useTenant** — `getTenantBySlug` diimpor dari modul yang salah.
5. **Tenant ID tidak konsisten** — `tenant_bakery-sari` vs `tenant_bakery_sari`.
   Sekarang satu helper `getTenantIdFromSlug()`.
6. **QRIS static dari Pengaturan tidak dipakai** — sekarang fallback payment
   membaca `aiwaku_qris_url`.
7. **Audit log ganda** — kunci v3 vs v5; diseragamkan (dengan migrasi kunci lama).
8. **Mutasi state di Customers** — `sort()` langsung pada state; diganti copy.
9. **Slot booking acak tiap refresh** — diganti hash deterministik.
10. **Skema Supabase tidak lengkap** — tambah tabel `payments`, `audit_logs`,
    kolom `orders` (tax, remaining, payment_url, qr_image_url), kolom bookings.
11. **Edge function `create-payment` belum ada** — ditambahkan (demo + Midtrans Snap).
12. **Calendar page placeholder** — sekarang agenda nyata + tombol Google Calendar.
13. **Layout duplikat + BrowserRouter** — digabung jadi satu Layout, HashRouter.
14. **Tanpa tsconfig** — ditambahkan tsconfig.json + vite-env.d.ts; `tsc --noEmit` bersih.


## Production Candidate — Phase 1 repair status

This branch is intentionally **not declared production-ready** yet.

### Fixed in this pass
- tenant-scoped localStorage for menus, orders, customers, bookings, audit logs
- menu persistence to Supabase when enabled
- booking create/cancel persistence to Supabase
- customer persistence with tenant filtering and error rollback
- audit log persistence to Supabase
- client-side `paid` mutation disabled when Supabase is enabled
- payment Edge Function now derives amount from the database order
- Midtrans webhook added with signature verification and idempotent payment lookup
- production RLS foundation added as `supabase/schema.production.sql`
- database constraints/indexes for non-negative money/stock and unique payment/booking slots
- `typecheck` script added

### Still required before production
1. Supabase Auth login/session and tenant membership UI.
2. Replace demo tenant IDs with real tenant UUIDs from `tenants`.
3. Apply production RLS only after Auth + tenant_members are populated.
4. Replace remaining localStorage-only order creation with server/database transaction.
5. Complete Reports, Catalog, and LiveChat functionality.
6. Add automated tests and run build/typecheck in CI.
7. Configure Midtrans webhook URL and secrets.
