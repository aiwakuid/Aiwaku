# AIWAKU V5 — Production Readiness

## Phase 2 completed

- Auth/tenant context added.
- Tenant membership becomes the source of truth for the active tenant.
- Payment Edge Function requires an authenticated user and membership.
- Order creation Edge Function added so prices, stock and totals are calculated server-side.
- Production SQL documents tenant membership and restrictive RLS.
- Remaining client-side payment mutation is blocked in Supabase mode.

## Still blocked from production

- [ ] Integrate `TenantAuthProvider` at the application root.
- [ ] Add login/logout UI and session recovery.
- [ ] Replace hard-coded/demo tenant resolution with authenticated membership.
- [ ] Route order creation through `create-order`.
- [ ] Atomically decrement stock when an order is accepted.
- [ ] Add idempotency key for order creation.
- [ ] Add payment row creation before invoking payment provider.
- [ ] Connect Midtrans webhook to the deployed function.
- [ ] Remove legacy `Allow all for MVP` policies from Supabase.
- [ ] Populate `tenant_members` from a trusted provisioning flow.
- [ ] Complete Reports/Catalog/LiveChat.
- [ ] Add unit/integration/RLS/E2E tests.
- [ ] Run `npm run typecheck` and `npm run build` in CI.

## Phase 3 completed

- Atomic PostgreSQL order function with row locking.
- Stock is decremented inside the same database transaction as order creation.
- Idempotency key prevents duplicate order creation on retry.
- Client helper added for authenticated server-side order creation.
- Payment row is created server-side before provider request.
- Midtrans webhook ignores already-paid duplicate notifications.

## Still required
- [ ] Wire `TenantAuthProvider` into the actual app root.
- [ ] Wire all order creation UI/actions to `createOrderServer`.
- [ ] Run database migration and remove every legacy permissive policy.
- [ ] Add stock restoration transaction for cancelled/expired orders where business rules require it.
- [ ] Verify payment row schema matches the deployed database exactly.
- [ ] Configure CORS/auth settings for Edge Functions.
- [ ] Automated tests for concurrency and idempotency.

## Phase 4 completed

- Atomic cancellation with stock restoration.
- Cancellation cannot restore stock twice.
- Payment settlement moved to a service-role-only database function.
- Payment amount is verified against the stored payment row.
- Basic Vitest test foundation added.
- Production test matrix added.
- Legacy permissive-policy removal script generated.

## Current release gate
This remains a **staging candidate**, not a production release, until:
- production RLS is actually applied in Supabase
- Auth provider is verified at runtime
- all order actions use server APIs
- CI passes typecheck/test/build
- real staging concurrency and tenant-isolation tests pass
