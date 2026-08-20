# Phase 5 — Validation & Release Gate

## Static validation

- Phase 1–4 source baseline inspected.
- Auth provider integration present in src/main.tsx.
- Atomic order, stock, cancellation, payment RPCs present in production schema.
- Legacy permissive-policy removal script present.

## Environment validation

The full npm validation suite was attempted but did not complete within the execution window. Therefore typecheck/test/build are NOT marked as passed.

## Release gates

1. Apply production SQL to staging Supabase.
2. Verify tenant isolation with two authenticated users.
3. Run concurrent stock/order test.
4. Verify idempotency.
5. Verify cancellation restores stock exactly once.
6. Verify Midtrans signature and paid webhook.
7. Run npm run typecheck.
8. Run npm test -- --run.
9. Run npm run build.
10. Run full browser E2E.
11. Remove all legacy permissive RLS policies.

**Release rule: do not call this production-ready until all gates pass.**
