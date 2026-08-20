-- Run this BEFORE enabling production RLS policies.
DROP POLICY IF EXISTS "Allow all for MVP" ON public.tenants;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.menus;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.orders;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.bookings;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.chats;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.promos;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.customers;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.payments;
DROP POLICY IF EXISTS "Allow all for MVP" ON public.audit_logs;
