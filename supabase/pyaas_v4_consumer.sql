-- ============================================================================
-- PYAAS v4 - CONSUMER-app additions (Know Your Milk, VIP delivery priority,
-- proof-of-delivery, founding-families + sustainability stats).
--
-- Run once in the shared Supabase project's SQL Editor, AFTER pyaas_v2_schema.sql.
-- Additive + idempotent. Pairs with the ops/Saathi app's pyaas_v4_farmer.sql
-- (which owns cattle/quality/batches); this file only adds the consumer-facing
-- bits and a self-contained "milk passport" so Know Your Milk works even before
-- the ops quality pipeline is wired in.
-- ============================================================================

-- ── 1. ORDER delivery fields (VIP priority / window / proof) ────────────────
alter table public.orders add column if not exists priority        text not null default 'normal'
  check (priority in ('vip','normal'));
alter table public.orders add column if not exists delivery_window  text;
alter table public.orders add column if not exists proof_photo_url  text;

-- ── 2. MILK PASSPORT - enrich traceability_samples into a full "Know Your Milk"
--     record. In production these are populated from the ops batch/quality
--     pipeline; seeded here so the consumer app is demoable standalone.
alter table public.traceability_samples add column if not exists farmer_name        text;
alter table public.traceability_samples add column if not exists village            text;
alter table public.traceability_samples add column if not exists collection_centre  text;
alter table public.traceability_samples add column if not exists collection_time    text;
alter table public.traceability_samples add column if not exists packaged_at        timestamptz;
alter table public.traceability_samples add column if not exists delivered_at        timestamptz;
alter table public.traceability_samples add column if not exists temperature_c      numeric;
alter table public.traceability_samples add column if not exists freshness_score    integer;   -- 0-100
alter table public.traceability_samples add column if not exists adulteration_passed boolean default true;

-- Enrich the existing demo sample (or insert one) with a full passport.
update public.traceability_samples
   set farmer_name = coalesce(farmer_name, 'Ramesh Verma'),
       village = coalesce(village, 'Mohanlalganj, Lucknow'),
       collection_centre = coalesce(collection_centre, 'PYAAS CC-01 · Mohanlalganj'),
       collection_time = coalesce(collection_time, '5:10 AM'),
       packaged_at = coalesce(packaged_at, now() - interval '6 hours'),
       delivered_at = coalesce(delivered_at, now() - interval '1 hour'),
       temperature_c = coalesce(temperature_c, 4.0),
       freshness_score = coalesce(freshness_score, 96),
       adulteration_passed = coalesce(adulteration_passed, true),
       snf = coalesce(snf, 8.7),
       fat = coalesce(fat, 4.1)
 where batch_code = 'PYAAS-A2-DEMO-0001';

insert into public.traceability_samples
  (batch_code, product_line, snf, fat, collected_at, qr_payload,
   farmer_name, village, collection_centre, collection_time, packaged_at, delivered_at,
   temperature_c, freshness_score, adulteration_passed)
select 'PYAAS-A2-DEMO-0001', 'a2', 8.7, 4.1, now(), 'pyaas://trace/PYAAS-A2-DEMO-0001',
       'Ramesh Verma', 'Mohanlalganj, Lucknow', 'PYAAS CC-01 · Mohanlalganj', '5:10 AM',
       now() - interval '6 hours', now() - interval '1 hour', 4.0, 96, true
where not exists (select 1 from public.traceability_samples where batch_code = 'PYAAS-A2-DEMO-0001');

-- ── 3. APP STATS - founding-families counter + community sustainability metrics
--     (public, editable in the dashboard).
create table if not exists public.app_stats (
  key    text primary key,
  value  numeric not null,
  label  text,
  unit   text
);
insert into public.app_stats (key, value, label, unit) values
  ('founding_families', 412,    'Founding families', ''),
  ('founding_target',   500,    'Founding goal',     ''),
  ('plastic_saved_kg',  1840,   'Plastic saved',     'kg'),
  ('farmers_supported', 36,     'Farmers supported', ''),
  ('local_sourcing_pct',100,    'Local sourcing',    '%'),
  ('carbon_saved_kg',   2600,   'CO₂ avoided',       'kg')
on conflict (key) do nothing;

alter table public.app_stats enable row level security;
drop policy if exists "app_stats read" on public.app_stats;
create policy "app_stats read" on public.app_stats for select to authenticated using (true);

-- ── 4. The latest milk passport for the signed-in customer (most recent batch).
--     Standalone fallback; in production join to the customer's delivered order.
create or replace function public.my_milk_passport()
returns setof public.traceability_samples language sql stable as $$
  select * from public.traceability_samples
  order by coalesce(delivered_at, created_at) desc
  limit 1;
$$;
grant execute on function public.my_milk_passport() to authenticated;

-- ============================================================================
-- DONE. Consumer app reads: traceability_samples (Know Your Milk + Quality),
-- app_stats (founding families + Sustainability), orders.priority/proof_photo_url.
-- The ops app's pyaas_v4_farmer.sql owns the bridge that fills proof_photo_url.
-- ============================================================================
