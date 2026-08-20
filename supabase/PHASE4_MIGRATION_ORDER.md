# Phase 4 Migration Order

1. Back up staging database.
2. Apply `schema.production.sql`.
3. Remove legacy permissive policies with `remove_legacy_permissive_policies.sql`.
4. Populate `tenant_members`.
5. Verify tenant isolation with two authenticated users.
6. Test `create_order_atomic`.
7. Test `cancel_order_atomic` and stock restoration.
8. Test `mark_payment_paid` only from service role/webhook.
9. Deploy Edge Functions.
10. Configure Midtrans webhook.
11. Run `npm ci && npm run typecheck && npm test && npm run build`.
12. Run the full matrix in `tests/PRODUCTION_TEST_MATRIX.md`.
