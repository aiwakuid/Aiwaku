# Phase 3 Migration Order

Run in this order in a staging Supabase project:

1. Create/verify `tenant_members`.
2. Populate tenant memberships using trusted admin tooling.
3. Apply `schema.production.sql`.
4. Remove legacy `Allow all for MVP` policies.
5. Verify RLS with two separate authenticated users from two tenants.
6. Verify `create_order_atomic()` with concurrent requests.
7. Verify stock cannot become negative.
8. Verify same idempotency key returns the same order.
9. Verify a different tenant cannot invoke an order for another tenant.
10. Deploy `create-order`.
11. Deploy `create-payment`.
12. Deploy `midtrans-webhook`.
13. Configure Midtrans webhook endpoint and secrets.
14. Run full E2E staging tests before production.
