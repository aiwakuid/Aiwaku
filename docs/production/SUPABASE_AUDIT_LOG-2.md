# AIWAKU — Supabase Audit Log

## 2026-08-25 — Production schema snapshot + v6.7 remediation audit

### Objective

Establish the actual Supabase production state before further v6.7 remediation or migration restoration.

The process was read-only. No database mutation was performed during snapshot capture.

---

## Audit 1 — Link and schema snapshot

The Supabase CLI was authenticated and the project was linked.

Command:

```bash
mkdir -p docs/production
supabase db dump --linked -f docs/production/SUPABASE_SCHEMA_SNAPSHOT_2026-08-25.sql
```

Result:

```text
Dumped schema to /workspaces/Aiwaku/docs/production/
SUPABASE_SCHEMA_SNAPSHOT_2026-08-25.sql
```

Snapshot size:

```text
2843 lines
```

**Decision:** retain this file as the raw production schema baseline for 25 August 2026.

---

## Audit 2 — Snapshot object counts

Text-level inspection produced:

```text
TABLES:     21
FUNCTIONS:  27
POLICIES:   27
RLS:        20
INDEXES:    14
TRIGGERS:   0
```

The trigger value comes only from `grep -c "CREATE TRIGGER"`.

**Decision:** do not interpret `TRIGGERS: 0` as proof of zero triggers. Verify PostgreSQL catalogs before trigger-dependent work.

---

## Audit 3 — Migration history

Previously verified production history does not record:

```text
20260830_v65_revoke_anon_rpc_access
v6.7 durable-inbox migration
```

**Decision:** do not infer actual database state solely from migration history and do not run v65 blindly.

---

## Audit 4 — RPC security

Audited sensitive functions:

```text
create_order_atomic
check_rate_limit
reserve_pending_payment_atomic
attach_midtrans_details_atomic
mark_payment_paid
```

These were already restricted to `service_role`.

Audited authenticated application RPCs were available to `authenticated`/`service_role` and not `anon`.

**Decision:** the main RPC-security objective associated with v65 is already substantively present. No security migration was applied during this audit.

---

## Audit 5 — `create_order_atomic`

Only the 10-parameter function exists.

The old 9-parameter overload is absent.

The function is `SECURITY DEFINER` with `search_path = public` and performs tenant membership validation, idempotency handling, menu locking, server-side totals, stock decrement, and order insertion.

**Decision:** no function drop/replacement was executed.

---

## Audit 6 — Default function privileges

For `postgres`:

```text
postgres       = EXECUTE
authenticated  = EXECUTE
service_role   = EXECUTE
anon           = NOT GRANTED
```

For `supabase_admin`:

```text
postgres       = EXECUTE
anon           = EXECUTE
authenticated  = EXECUTE
service_role   = EXECUTE
```

**Decision:** record `supabase_admin` default `anon EXECUTE` as a reconciliation/security-hardening item. Do not change it without a deliberate migration.

---

## Audit 7 — WhatsApp conversation

`public.wa_conversations` exists with the audited conversation fields.

Existing:

```text
wa_conversations_active_idx
```

defined as a unique `(tenant_id, customer_wa)` boundary for active conversations.

**Decision:** do not recreate this index blindly.

---

## Audit 8 — WhatsApp messages

`public.wa_messages` contains:

```text
id
conversation_id
tenant_id
direction
message_type
body
provider_message_id
raw_payload
created_at
```

Current indexes:

```text
wa_messages_pkey
wa_messages_conversation_idx
```

The audit did not find:

```text
UNIQUE (tenant_id, provider_message_id)
```

or durable processing fields:

```text
processing_status
processing_started_at
processed_at
processing_attempts
processing_error
```

**Decision:** durable-inbox state is not yet verified as applied.

---

## Audit 9 — Orders

`public.orders` does not contain:

```text
wa_conversation_id
```

Current indexes include:

```text
orders_pkey
orders_invoice_no_key
orders_created_at_idx
orders_tenant_id_idx
orders_tenant_fulfillment_idx
```

**Decision:** exact originating WhatsApp conversation is not currently stored on the order.

---

## Audit 10 — v6.7 readiness

### Present

```text
wa_conversations                         ✅
active conversation unique boundary     ✅
wa_messages                             ✅
provider_message_id                     ✅
orders                                  ✅
```

### Missing / not verified

```text
unique inbound provider-message boundary ❌
processing state                         ❌
processing lease                         ❌
processing attempts                      ❌
processing error                         ❌
processed timestamp                     ❌
orders.wa_conversation_id               ❌
claim/finish/retry RPCs                  ❌
```

**Decision:** do not apply the full v6.7 migration blindly. First verify the exact gaps and create the smallest safe reconciliation migration.

---

## Audit 11 — Baseline artifacts

The baseline now consists of:

```text
docs/production/SUPABASE_PRODUCTION_STATE.md
docs/production/SUPABASE_AUDIT_LOG.md
docs/production/SUPABASE_SCHEMA_SNAPSHOT_2026-08-25.sql
```

Purposes:

- `SUPABASE_PRODUCTION_STATE.md` — current production state.
- `SUPABASE_AUDIT_LOG.md` — audit findings and decisions.
- `SUPABASE_SCHEMA_SNAPSHOT_2026-08-25.sql` — raw schema snapshot from production.

## Final decision

**READ-ONLY PRODUCTION BASELINE ESTABLISHED.**

Before another database mutation:

1. inspect the snapshot;
2. verify trigger/function/policy details from PostgreSQL catalogs where required;
3. compare actual state with intended v6.7 changes;
4. create only the required reconciliation migration;
5. test;
6. apply deliberately;
7. take a new production snapshot.
