-- ============================================================================
-- PYAAS v5 - RIDER ⇄ CONSUMER real-time sync + milk-trace upload backdoor.
-- Run once in the shared Supabase project's SQL Editor (additive, idempotent).
-- Finalised shapes may change once the rider-app architecture is shared; the
-- RPC below is the stable contract the rider app should call.
-- ============================================================================

-- 1) Link a delivered order to the batch it carried (so the consumer's
--    "Know your milk" shows the exact batch the rider delivered).
alter table public.orders add column if not exists batch_code text;

-- 2) RIDER BACKDOOR: the rider app uploads the milk trace (collection + lab
--    values) for a batch. SECURITY DEFINER + rider-only (mirrors the existing
--    rider_* functions). Upserts into traceability_samples by batch_code.
create or replace function public.rider_upload_trace(
  p_batch_code text,
  p_product_line text default null,
  p_farmer_name text default null,
  p_village text default null,
  p_collection_centre text default null,
  p_collection_time text default null,
  p_snf numeric default null,
  p_fat numeric default null,
  p_temperature_c numeric default null,
  p_freshness_score integer default null,
  p_adulteration_passed boolean default true,
  p_order_id uuid default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_rider uuid;
begin
  select id into v_rider from public.riders where user_id = auth.uid();
  if v_rider is null then raise exception 'Caller is not a registered rider'; end if;

  insert into public.traceability_samples
    (batch_code, product_line, farmer_name, village, collection_centre, collection_time,
     snf, fat, temperature_c, freshness_score, adulteration_passed, packaged_at, delivered_at, qr_payload)
  values
    (p_batch_code, p_product_line, p_farmer_name, p_village, p_collection_centre, p_collection_time,
     p_snf, p_fat, p_temperature_c, p_freshness_score, coalesce(p_adulteration_passed, true), now(), now(),
     'pyaas://trace/' || p_batch_code)
  on conflict (batch_code) do update set
     product_line = coalesce(excluded.product_line, traceability_samples.product_line),
     farmer_name = coalesce(excluded.farmer_name, traceability_samples.farmer_name),
     village = coalesce(excluded.village, traceability_samples.village),
     collection_centre = coalesce(excluded.collection_centre, traceability_samples.collection_centre),
     collection_time = coalesce(excluded.collection_time, traceability_samples.collection_time),
     snf = coalesce(excluded.snf, traceability_samples.snf),
     fat = coalesce(excluded.fat, traceability_samples.fat),
     temperature_c = coalesce(excluded.temperature_c, traceability_samples.temperature_c),
     freshness_score = coalesce(excluded.freshness_score, traceability_samples.freshness_score),
     adulteration_passed = excluded.adulteration_passed,
     delivered_at = now();

  if p_order_id is not null then
    update public.orders set batch_code = p_batch_code where id = p_order_id and rider_id = v_rider;
  end if;
end; $$;
grant execute on function public.rider_upload_trace(text, text, text, text, text, text, numeric, numeric, numeric, integer, boolean, uuid) to authenticated;

-- traceability_samples needs a unique batch_code for the upsert above.
create unique index if not exists traceability_samples_batch_uidx on public.traceability_samples(batch_code);

-- 3) Per-customer passport: prefer the batch on the customer's most recent
--    delivered order; else the latest sample (keeps my_milk_passport working).
create or replace function public.my_milk_passport()
returns setof public.traceability_samples language sql stable as $$
  with my_batch as (
    select batch_code from public.orders
    where user_id = auth.uid() and batch_code is not null
    order by placed_at desc limit 1
  )
  select * from (
    select * from public.traceability_samples
    where batch_code = (select batch_code from my_batch)
    union all
    select * from public.traceability_samples
    where not exists (select 1 from my_batch)
  ) t
  order by coalesce(t.delivered_at, t.created_at) desc
  limit 1;
$$;
grant execute on function public.my_milk_passport() to authenticated;

-- 4) REALTIME: enable change streams so the consumer app reflects rider-app
--    writes instantly (order/[id].tsx subscribes to these).
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.riders;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.order_events;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.traceability_samples;
exception when duplicate_object then null; end $$;

-- ============================================================================
-- RIDER APP CONTRACT (call these; all SECURITY DEFINER, rider-authorised):
--   rider_claim_order(order_id)              -- claim an unassigned order
--   rider_update_status(order_id, status)    -- assigned → out_for_delivery → delivered
--   rider_update_location(lat, lng)          -- live GPS (mirrors to riders)
--   rider_settle_order_from_wallet(order_id) -- debit wallet on delivery
--   rider_upload_trace(batch_code, …, order_id)  -- upload milk trace for a batch
-- Consumer subscribes via Supabase Realtime (orders/riders/order_events/traceability).
-- ============================================================================
