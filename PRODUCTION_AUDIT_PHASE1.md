# AIWAKU V5 — Production Audit Phase 1

## Decision
Kimi remains the base branch. This package is a **repair baseline**, not a final production release.

## Critical findings addressed
- RLS was `allow all` for anon/authenticated.
- Client could directly mutate payment status to `paid`.
- Payment amount was trusted from the browser.
- Booking UI changed only React state/localStorage and did not write bookings to Supabase.
- Menu/customer/booking/audit localStorage keys were not consistently tenant-scoped.
- Tenant IDs derived from slug were not guaranteed to equal real Supabase tenant UUIDs.
- Demo/production claims in the UI were too strong.

## Architecture decision
The target architecture is:

Auth
→ tenant_members
→ tenant-scoped RLS
→ Supabase persistence
→ server-side transaction/payment logic
→ verified payment webhook
→ audit trail
→ UI/realtime cache

## Important boundary
The existing application has no complete Auth/session/tenant-membership flow. Therefore this package deliberately does NOT claim that secure RLS is already live. `schema.production.sql` is the foundation that must be applied together with the Auth phase.

## Next phase
Implement Auth + tenant resolution from the authenticated membership, then migrate Orders/Invoice to server/database persistence and remove remaining demo-only behavior.
