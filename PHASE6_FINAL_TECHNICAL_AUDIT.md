# AIWAKU V5 — Phase 6 Final Technical Audit

## Scope

Phase 6 consolidates the production architecture from Phase 1–5. No new business feature was added. The work focuses on security boundaries, tenant identity, mutation paths, order/payment consistency, and removal of demo behavior from production flows.

## Fixed

- Added `AuthTenantGuard` to the application layout.
- Added a real Supabase email/password login route.
- Tenant resolution now uses the authenticated `tenant_members` relationship; URL slug is checked against membership.
- Removed automatic tenant creation from the client.
- Removed deterministic fake tenant IDs from production page data access.
- Removed direct client `insert/update/upsert` mutations for menus, customers, bookings, and audit logs; these now use security-definer RPCs.
- Fixed order status mismatch: `baru` is no longer written; production creation uses `pending`.
- Standardized persisted order items to `menu_id`, `name`, `qty`, `price`, `subtotal`.
- Fixed cancellation stock restoration to read the canonical item schema.
- Added production RPCs for menu/customer/booking/audit mutations.
- Added payment idempotency behavior for an existing pending payment per order.
- Removed Demo QRIS fallback from the production payment function.
- Removed the production “Simulasi LUNAS” path from the invoice UI.
- Payment rows are now created only after Midtrans accepts the transaction.
- Added Edge Function CORS handling for browser invocation.
- Added production schema alignment for `updated_at` and `idempotency_key`.
- Production migration now removes the legacy `Allow all for MVP` policies before installing tenant-scoped policies.
- Added tenant discovery RLS policy for active tenants only.

## Not falsely marked PASS

The following still require a real environment and are intentionally NOT VERIFIED here:

- `npm ci` + clean dependency installation
- TypeScript typecheck after clean install
- Vite production build after clean install
- Supabase migration execution against a staging project
- RLS cross-tenant isolation test with two authenticated users
- concurrent stock deduction test
- duplicate order/idempotency test against PostgreSQL
- duplicate/replayed Midtrans webhook test
- real Midtrans payment lifecycle
- complete browser E2E from login to webhook and dashboard

## Release decision

**RELEASE BLOCKED until staging gates pass.**

Static P0/P1 architecture blockers identified in Phase 5 have been addressed in source. This does not convert staging-dependent checks into PASS.
