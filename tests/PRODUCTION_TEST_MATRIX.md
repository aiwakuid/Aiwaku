# Production Test Matrix

## Tenant isolation
- User A can read tenant A.
- User A cannot read tenant B.
- User A cannot insert/update rows into tenant B.
- Staff cannot manage tenant membership.
- Owner/admin can manage business data according to policy.

## Orders
- inactive product rejected
- insufficient stock rejected
- negative quantity rejected
- total is server-calculated
- simultaneous orders cannot oversell
- same idempotency key returns one order
- different idempotency keys create distinct orders

## Cancellation
- cancellation restores stock exactly once
- paid order cannot be cancelled by generic cancel flow
- cancelled order cannot be paid
- cancellation creates audit event

## Payments
- invalid Midtrans signature rejected
- unknown provider order ignored safely
- wrong amount rejected
- repeated paid webhook is idempotent
- payment cannot be marked paid by anon/authenticated client

## Build
- npm ci
- npm run typecheck
- npm run test
- npm run build
