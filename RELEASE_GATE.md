# AIWAKU V5 — RELEASE GATE

## Static source gate

- [x] Auth/Tenant foundation wired into application layout
- [x] URL tenant slug checked against authenticated tenant membership
- [x] No client-side tenant auto-provisioning
- [x] Business-critical client mutations moved to server-side RPCs
- [x] Canonical order item schema aligned
- [x] Order status `baru` removed from production creation path
- [x] Atomic cancellation reads canonical item quantity/menu ID
- [x] Payment production path has no demo fallback
- [x] Payment has existing-pending protection
- [x] Legacy permissive RLS policy removal included in production migration
- [x] Production schema adds required `updated_at` / `idempotency_key` fields
- [x] Login flow exists

## Environment gate

- [x] Clean `npm ci` — verified via GitHub Actions CI run #10 (branch `main`, commit
      f6cf301): Status Success, 30s.
      https://github.com/aiwakuid/Aiwaku/actions/runs/32578093050
- [x] Typecheck — part of the same passing CI `verify` job
      (`ci.yml`: npm ci → typecheck → test → build, all steps green).
- [x] Test — reconfirmed manually in GitHub Codespaces (branch
      `fase1-security-hardening`, 2026-08-22): `npm test` → 3 test files passed (3),
      7 tests passed (7), duration 2.42s.
- [x] Production build — reconfirmed manually in the same Codespaces session:
      `npm run build` → vite build succeeded, 2735 modules transformed, `dist/`
      output generated (index.html, CSS, JS chunks), built in 8.12s.
      App is also live and reachable at https://aiwaku.vercel.app (deployed build).
- [ ] Staging migration — not yet independently verified (requires direct
      Supabase project/dashboard access to confirm migrations were applied).
- [ ] RLS isolation — not yet independently verified (requires two authenticated
      test users from different tenants).
- [ ] Concurrent stock test — not yet independently verified.
- [ ] Order idempotency test — not yet independently verified (against live DB).
- [ ] Atomic cancellation + stock restoration test — not yet independently verified.
- [ ] Midtrans signature/replay/amount tests — not yet independently verified.
- [ ] Full E2E login → menu → order → payment → webhook → dashboard — not yet
      independently verified.

## Decision

**PARTIALLY VERIFIED — build/test gate PASSED. Database/payment runtime gate still open.**

Static source gate: PASS (source-level review).
Build/typecheck/test/production-build: PASS — confirmed both via GitHub Actions CI
(run #10 on `main`, 2026-08-22) and manually reproduced in GitHub Codespaces the
same day. The app is deployed and reachable at https://aiwaku.vercel.app.

Still required before this can be marked READY FOR PRODUCTION: confirm the staging
Supabase migrations were actually applied, and run the RLS cross-tenant isolation,
concurrency/idempotency, cancellation-restoration, and Midtrans webhook tests
against a live Supabase/Midtrans environment (see `tests/PRODUCTION_TEST_MATRIX.md`
and `supabase/PHASE4_MIGRATION_ORDER.md`).
