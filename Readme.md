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
