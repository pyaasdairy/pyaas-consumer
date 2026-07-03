-- ============================================================================
-- PYAAS v6 - CONSUMER ⇄ SAATHI sync reconciliation.
-- Run once in the shared project's SQL Editor, AFTER the ops chain
-- (unified_schema → … → pyaas_v5_scale). Additive + idempotent.
--
-- Implements the consumer-side reconciliations from the integration note §9:
--   1. orders.rider_id now points at app_users (riders write their own id via
--      the bridge). Legacy demo rows pointing at the old consumer `riders`
--      table are nulled so the FK can retarget safely.
--   2. Consumers may read the assigned rider's public fields from app_users.
-- ============================================================================

-- 1) Retarget orders.rider_id → app_users(id)
do $$
begin
  -- Null out legacy rider ids that don't exist in app_users (old demo orders).
  update public.orders o
     set rider_id = null
   where rider_id is not null
     and not exists (select 1 from public.app_users a where a.id = o.rider_id);

  alter table public.orders drop constraint if exists orders_rider_id_fkey;
  alter table public.orders
    add constraint orders_rider_id_fkey
    foreign key (rider_id) references public.app_users(id) on delete set null;
end $$;

-- 2) Consumers (any authenticated user) can read riders' public fields so the
--    tracking screen can show name/phone/vehicle/live GPS. Saathi staff rows
--    only; scoped to the rider role to avoid exposing other staff.
alter table public.app_users enable row level security;
drop policy if exists "consumer reads riders" on public.app_users;
create policy "consumer reads riders" on public.app_users
  for select to authenticated
  using (role = 'rider');

-- 3) Optional realtime: enable Realtime on `orders` and `app_users` in
--    Database → Replication for push updates (the app polls every 5s today).

-- Sanity:
-- select id, rider_id from public.orders where rider_id is not null limit 5;
-- select id, full_name, current_lat, current_lng from public.app_users where role = 'rider';
