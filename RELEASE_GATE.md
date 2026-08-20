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

- [ ] Clean `npm ci`
- [ ] Typecheck
- [ ] Production build
- [ ] Staging migration
- [ ] RLS isolation
- [ ] Concurrent stock test
- [ ] Order idempotency test
- [ ] Atomic cancellation + stock restoration test
- [ ] Midtrans signature/replay/amount tests
- [ ] Full E2E login → menu → order → payment → webhook → dashboard

## Decision

**NOT READY FOR PRODUCTION.**

Static source blockers from Phase 5 are fixed. Release remains blocked until every environment gate above is verified in staging.
