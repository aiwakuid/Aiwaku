# AIWAKU V5 — Consolidation Report

This package is the consolidated candidate built from:
- `AIWAKU-V5-PHASE6-FIXED` as the security/production architecture base.
- `aiwaku-v5-p2-sempurna` as the feature/UI source.
- `aiwaku-v5-p2-qris-calendar-sheets.zip` was inspected but is an HTML download page, not a valid ZIP archive, so no code could be safely extracted from it.

## Kept from Phase 6
- Supabase Auth + tenant membership guard.
- Tenant-scoped access and production RLS foundation.
- Server-side atomic order creation and stock locking.
- Idempotency for order creation.
- Atomic cancellation + stock restoration.
- Server-only payment settlement.
- Midtrans webhook signature/idempotency checks.
- RPC-based admin mutations.
- Tenant-scoped localStorage migration.
- Deterministic booking slots and date-switch corruption fix.
- Production release gate and test matrix.

## Recovered from P2
- Real Reports dashboard.
- Real Catalog page with search/filter and WA ordering.
- Functional LiveChat simulation/inbox UX.
- Rich month Calendar view.
- Google Calendar and Google Sheets Edge Function implementations.

## Additional consolidation fixes
- Server order payload now maps `menuId/quantity` to canonical `menu_id/qty`.
- Order RPC now persists `pickup_time` and `custom_text`.
- Order row locking is stable by canonical menu ID to reduce deadlock risk.
- Calendar/Sheets calls carry the authenticated tenant ID.
- Google sync Edge Functions verify Authorization and tenant membership.
- `tenant_secrets` is defined as service-role-only storage for OAuth secrets.

## Important release status
This remains a **staging candidate**, not a production-certified release. Environment-dependent gates still need a real Supabase/Midtrans/Google staging environment:
- clean `npm ci`
- typecheck/test/build
- RLS cross-tenant tests
- concurrent stock/idempotency tests
- real Midtrans lifecycle + replay/amount tests
- Google OAuth/Calendar/Sheets integration test
- full browser E2E
