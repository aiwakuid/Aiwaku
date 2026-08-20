# AIWAKU V5.7 — H1 Inventory Mutation Implementation Report

STATUS: PARTIAL — implementation prepared; runtime verification blocked by missing dependencies

## Files created
- supabase/migrations/20260821_v57_inventory_mutation_boundary.sql
- tests/inventoryMutationBoundary.test.ts
- AIWAKU-V5.7-INVENTORY-MUTATION-CONTRACT-v1.1.md

## Files modified
- src/pages/Inventory.tsx
- package.json (5.6.0 → 5.7.0)
- package-lock.json (root version 5.6.0 → 5.7.0)

## Security changes
- ingredients and menu_recipes are read-only to authenticated clients
- inventory configuration writes are forced through SECURITY DEFINER RPCs
- RPCs require auth.uid() and is_tenant_admin(tenant_id)
- recipe menu/ingredient tenant ownership is validated inside PostgreSQL
- inventory_transactions remains member-read/server-insert

## Client changes
Inventory.tsx now uses admin_create_ingredient, admin_upsert_recipe, admin_delete_recipe and retains restock_ingredient. No direct client insert/update/delete/upsert remains for ingredients/menu_recipes.

## Verification
Static source/migration checks: PASS.
Vitest execution: BLOCKED because node_modules/vitest is not installed in the uploaded repository.
Typecheck/build: BLOCKED for the same dependency-installation condition. The H0 audit previously identified this environment issue and required a clean npm ci in a registry-capable environment.

## Important clarification
v1.1 intentionally resolves the v1.0 tension between “RPC-only mutation boundary” and direct admin table-write RLS by making inventory configuration tables SELECT-only for authenticated clients. Admin mutation is exclusively via the validated RPCs.

## Next immediate action
Run `npm ci`, then `npm run typecheck`, `npm test`, and `npm run build`. After that, apply the migration to staging and execute tenant-isolation, inventory concurrency/idempotency, order consumption, and cancellation restoration tests.
