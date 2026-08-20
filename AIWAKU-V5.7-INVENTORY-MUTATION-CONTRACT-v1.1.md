# AIWAKU V5.7 — INVENTORY MUTATION CONTRACT v1.1

**Status:** READY FOR IMPLEMENTATION / SECURITY-CLARIFIED
**Basis:** v1.0 contract + H0 repository audit + implementation review

## 1. Security clarification

The v1.0 contract contained a tension between two requirements:

1. inventory configuration mutations must use explicit RPC/domain actions; and
2. RLS should grant authenticated admins direct INSERT/UPDATE/DELETE.

For a strict mutation boundary, v1.1 resolves this by making the client-facing table boundary **read-only** for `ingredients` and `menu_recipes`. Admin writes happen only through `SECURITY DEFINER` RPCs that perform explicit authorization and tenant validation.

Therefore:

- authenticated tenant members: SELECT only
- authenticated tenant admins: mutate through the three admin RPCs
- no authenticated direct INSERT/UPDATE/DELETE on inventory configuration tables
- `inventory_transactions`: SELECT for members, server-side INSERT only

This is stronger and directly enforces the client contract at the database boundary.

## 2. Tenant authority

`tenant_id` supplied to an RPC is context, not authorization.

Every mutation must execute:

`auth.uid()` → `is_tenant_admin(p_tenant_id)` → validated mutation

The RPC must never trust a client-supplied tenant ID without membership/admin validation.

## 3. Atomic recipe validation

`admin_upsert_recipe` must validate all of the following within the same PostgreSQL function execution before mutation:

- caller is admin of `p_tenant_id`
- menu exists and belongs to `p_tenant_id`
- ingredient exists and belongs to `p_tenant_id`
- quantity > 0

The validation and upsert must not be split into client-side checks.

## 4. RPC contracts

### `admin_create_ingredient(p_ingredient jsonb)`

Required fields:

- tenant_id
- name
- unit
- stock
- reorder_point
- cost_per_unit

Rules:

- authenticated caller required
- caller must be tenant admin
- name trimmed and non-empty
- unit trimmed and non-empty
- stock >= 0
- reorder_point >= 0
- cost_per_unit >= 0
- uniqueness `(tenant_id, name)` preserved
- returns created row as JSON

### `admin_upsert_recipe(p_recipe jsonb)`

Required fields:

- tenant_id
- menu_id
- ingredient_id
- quantity

Rules:

- authenticated caller required
- caller must be tenant admin
- menu and ingredient must belong to the same supplied tenant
- quantity > 0
- upsert key remains `(menu_id, ingredient_id)`
- returns resulting row as JSON

### `admin_delete_recipe(p_recipe_id uuid)`

Rules:

- authenticated caller required
- resolve tenant from recipe row
- caller must be admin of that tenant
- delete only requested recipe
- return result JSON

## 5. Existing operational boundary

`restock_ingredient` remains the operational mutation RPC.

It must retain:

- authenticated caller
- ingredient existence check
- tenant membership check
- positive quantity
- row lock
- atomic stock + transaction history update

## 6. Order inventory authority

No change.

The authoritative path remains:

`Order → Recipe → Ingredient Stock → Inventory Transaction`

Do not add frontend stock deduction.

Existing order consumption and cancellation restoration functions remain responsible for inventory movement and idempotency.

## 7. RLS

### `ingredients`

Authenticated tenant members: SELECT only.

No authenticated direct INSERT/UPDATE/DELETE.

### `menu_recipes`

Authenticated tenant members: SELECT only.

No authenticated direct INSERT/UPDATE/DELETE.

### `inventory_transactions`

Authenticated tenant members: SELECT only.

Trusted server-side execution: INSERT.

No authenticated UPDATE/DELETE.

## 8. Client contract

`Inventory.tsx` must use:

- `rpc('admin_create_ingredient', ...)`
- `rpc('admin_upsert_recipe', ...)`
- `rpc('admin_delete_recipe', ...)`
- `rpc('restock_ingredient', ...)`

Reads may remain tenant-scoped table SELECTs.

No direct client mutation against `ingredients` or `menu_recipes`.

## 9. Release reconciliation

Because the repository contains V5.7 inventory code while `package.json` reports `5.6.0`, implementation includes version reconciliation to `5.7.0` before release tagging.

## 10. Definition of Done

- mutation-boundary migration created
- configuration tables read-only to authenticated clients
- three admin RPCs implemented
- restock RPC verified
- Inventory UI migrated
- direct mutation search clean
- typecheck passes
- tests pass
- build passes
- tenant isolation tests pass
- inventory consumption/idempotency tests pass
- cancellation restoration tests pass
- migration ordering documented

Code creation alone is not DONE.
