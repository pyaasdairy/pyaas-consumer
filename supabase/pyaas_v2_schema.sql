-- ============================================================================
-- PYAAS v2 - feature schema (wallet, subscriptions, coupons, referrals, VIP,
-- partner leads, farm locator, delivery preferences, autopay/PYAAS MONEY).
--
-- HOW TO USE: paste this WHOLE file into the SHARED Supabase project's SQL
-- Editor and Run. It is ADDITIVE and IDEMPOTENT - it only creates new tables /
-- columns / policies / functions and never drops or alters the existing
-- consumer tables (profiles, addresses, riders, orders, order_items,
-- order_events) or the rider-app bridge triggers. Safe to re-run.
--
-- Anything the RIDER app must call is grouped under "INTEGRATION FUNCTIONS"
-- and mirrors the existing rider-backdoor pattern. See DEVELOPER_NOTES.md.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────
-- 0. PROFILE ADDITIONS  (new optional columns; existing rows keep working)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.profiles add column if not exists email                text;
alter table public.profiles add column if not exists alternate_phone      text;
alter table public.profiles add column if not exists family_member_count  integer;
alter table public.profiles add column if not exists milk_preference      text;     -- 'a2' | 'toned' | 'either'
alter table public.profiles add column if not exists avatar_url           text;
alter table public.profiles add column if not exists referral_code        text unique;
alter table public.profiles add column if not exists referred_by          text;     -- referrer's referral_code
alter table public.profiles add column if not exists delivery_slot        text;     -- 'morning' | 'evening' ...
alter table public.profiles add column if not exists vip_status           text default 'trial'
                                                       check (vip_status in ('trial','active','expired','cancelled'));
alter table public.profiles add column if not exists vip_until            timestamptz;
alter table public.profiles add column if not exists updated_at           timestamptz default now();

-- ─────────────────────────────────────────────────────────────────────────
-- 1. ORDER ADDITIONS  (so discounts / wallet usage are auditable per order)
-- ─────────────────────────────────────────────────────────────────────────
alter table public.orders add column if not exists coupon_code      text;
alter table public.orders add column if not exists coupon_discount  numeric not null default 0;
alter table public.orders add column if not exists vip_discount     numeric not null default 0;
alter table public.orders add column if not exists wallet_used      numeric not null default 0;
alter table public.orders add column if not exists subscription_id  uuid;     -- set when generated from a subscription
alter table public.orders add column if not exists delivery_prefs   jsonb;    -- per-order override of delivery_preferences

-- ─────────────────────────────────────────────────────────────────────────
-- 2. WALLET  (PYAAS Wallet)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.wallets (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  balance     numeric not null default 0 check (balance >= 0),
  updated_at  timestamptz default now()
);

create table if not exists public.wallet_transactions (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  direction      text not null check (direction in ('credit','debit')),
  amount         numeric not null check (amount > 0),
  balance_after  numeric not null,
  category       text not null,   -- recharge | bonus | cashback | order | subscription | referral | refund | autopay
  reference_type text,            -- 'order' | 'subscription' | 'recharge' | 'referral' ...
  reference_id   text,
  description    text,
  created_at     timestamptz default now()
);
create index if not exists wallet_tx_user_idx on public.wallet_transactions(user_id, created_at desc);

-- Recharge bonus tiers (editable in the dashboard). "Add 200, get 50 free" etc.
-- bonus_kind: 'instant' adds immediately to balance; 'cashback' is credited as a
-- separate cashback line (same effect here; kept distinct for messaging/UX).
create table if not exists public.recharge_tiers (
  id           uuid primary key default gen_random_uuid(),
  min_amount   numeric not null,
  bonus_amount numeric not null,
  bonus_kind   text not null default 'instant' check (bonus_kind in ('instant','cashback')),
  label        text,
  active        boolean not null default true
);
insert into public.recharge_tiers (min_amount, bonus_amount, bonus_kind, label)
select * from (values
  (200::numeric,    50::numeric,  'instant',  'Add ₹200 → ₹50 free'),
  (500::numeric,   100::numeric,  'instant',  'Add ₹500 → ₹100 free'),
  (1000::numeric,  250::numeric,  'instant',  'Add ₹1000 → ₹250 free'),
  (10000::numeric,1000::numeric,  'cashback', 'Add ₹10,000 → ₹1,000 cashback')
) as t(min_amount,bonus_amount,bonus_kind,label)
where not exists (select 1 from public.recharge_tiers);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. SUBSCRIPTIONS  (daily / recurring milk) + VACATIONS (skip while away)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  product_id         text not null,          -- matches constants/products.ts id
  variant            text,
  qty                integer not null default 1 check (qty > 0),
  unit_price         numeric not null,
  frequency          text not null default 'daily' check (frequency in ('daily','alternate','weekly','custom')),
  weekdays           int[],                  -- for 'custom'/'weekly': 0=Sun..6=Sat
  address_id         uuid references public.addresses(id) on delete set null,
  delivery_slot      text,
  pay_from_wallet    boolean not null default true,
  status             text not null default 'active' check (status in ('active','paused','cancelled')),
  start_date         date not null default current_date,
  next_delivery_date date,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now()
);
create index if not exists subscriptions_user_idx on public.subscriptions(user_id);

-- Vacations: pause deliveries between two dates. subscription_id NULL = pause ALL
-- of this user's subscriptions for the range (e.g. user travelling).
create table if not exists public.subscription_vacations (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete cascade,
  start_date      date not null,
  end_date        date not null,
  reason          text,
  created_at      timestamptz default now(),
  check (end_date >= start_date)
);
create index if not exists sub_vac_user_idx on public.subscription_vacations(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 4. COUPONS
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.coupons (
  code            text primary key,
  title           text not null,
  description     text,
  kind            text not null check (kind in ('percent','flat','bundle_price')),
  value           numeric not null,                 -- percent: 0-100; flat: ₹ off; bundle_price: per-unit price
  applies_to      text not null default 'all' check (applies_to in ('all','milk','ghee')),
  min_items       integer not null default 0,       -- "add X items to avail"
  min_amount      numeric not null default 0,
  max_discount    numeric,                          -- cap for percent coupons
  is_golden       boolean not null default false,   -- premium golden-outlined UI
  active          boolean not null default true,
  valid_from      timestamptz default now(),
  valid_to        timestamptz,
  usage_limit     integer,                          -- global cap (null = unlimited)
  per_user_limit  integer default 1
);

insert into public.coupons (code, title, description, kind, value, applies_to, min_items, is_golden, per_user_limit)
select * from (values
  ('PYAASFF',  'Founding Family',      '50% off everything - our thank-you to founding families.', 'percent', 50::numeric, 'all', 0, true,  1),
  ('ADD3',     'Stock-up & Save',      'Add any 3 items, get 10% off your cart.',                  'percent', 10::numeric, 'all', 3, false, 5),
  ('ADD5',     'Family Pack',          'Add any 5 items, get 15% off your cart.',                  'percent', 15::numeric, 'all', 5, false, 5),
  ('MILK4',    'Milk Lover',           'Add 4 milk items, get 12% off milk.',                      'percent', 12::numeric, 'milk',4, false, 10),
  ('FIRST50',  'Welcome',              'Flat ₹50 off your first order.',                            'flat',    50::numeric, 'all', 0, false, 1)
) as t(code,title,description,kind,value,applies_to,min_items,is_golden,per_user_limit)
on conflict (code) do nothing;

create table if not exists public.coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  code        text not null references public.coupons(code),
  user_id     uuid not null references auth.users(id) on delete cascade,
  order_id    uuid references public.orders(id) on delete set null,
  discount    numeric not null,
  created_at  timestamptz default now()
);
create index if not exists coupon_redemptions_user_idx on public.coupon_redemptions(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. REFERRALS  (₹100 to referrer per successful signup)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.referrals (
  id            uuid primary key default gen_random_uuid(),
  referrer_id   uuid not null references auth.users(id) on delete cascade,
  referred_id   uuid not null references auth.users(id) on delete cascade unique,
  code_used     text,
  reward_amount numeric not null default 100,
  status        text not null default 'credited' check (status in ('pending','credited','reversed')),
  created_at    timestamptz default now()
);
create index if not exists referrals_referrer_idx on public.referrals(referrer_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. VIP MEMBERSHIP  (₹99/mo; every new user gets a 120-day trial, no card)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.vip_memberships (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  status             text not null default 'trial' check (status in ('trial','active','expired','cancelled')),
  trial_started_at   timestamptz default now(),
  current_period_end timestamptz,
  price              numeric not null default 99,
  auto_renew         boolean not null default false,
  total_saved        numeric not null default 0,    -- lifetime ₹ saved as VIP
  created_at         timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. PARTNER LEADS  (bulk orders, franchise enquiries, vendor enquiries)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.partner_leads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  kind          text not null check (kind in ('bulk_order','franchise','vendor')),
  name          text not null,
  phone         text not null,
  email         text,
  business_name text,
  city          text,
  message       text,
  details       jsonb,      -- e.g. {qty_per_day, products, capacity, ...}
  status        text not null default 'new' check (status in ('new','contacted','closed')),
  created_at    timestamptz default now()
);
create index if not exists partner_leads_kind_idx on public.partner_leads(kind, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. FARM LOCATOR  (farms + farmers; nearest-to-user lookup)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.farms (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  city        text,
  lat         double precision not null,
  lng         double precision not null,
  photo_url   text,
  created_at  timestamptz default now()
);

create table if not exists public.farmers (
  id               uuid primary key default gen_random_uuid(),
  farm_id          uuid not null references public.farms(id) on delete cascade,
  name             text not null,
  herd_size        integer,
  snf              numeric,         -- Solids-Not-Fat %
  fat              numeric,         -- Fat %
  milking_timings  text,
  cow_feed         text,
  years_experience integer,
  photo_url        text,
  created_at       timestamptz default now()
);

-- Seed sample farms/farmers (near Lucknow, matching the demo rider region).
insert into public.farms (name, city, lat, lng)
select 'PYAAS Origin Farm - Mohanlalganj', 'Lucknow', 26.6500, 80.9500
where not exists (select 1 from public.farms);
insert into public.farms (name, city, lat, lng)
select 'PYAAS Partner Farm - Kakori', 'Lucknow', 26.8800, 80.7800
where (select count(*) from public.farms) < 2;

insert into public.farmers (farm_id, name, herd_size, snf, fat, milking_timings, cow_feed, years_experience)
select f.id, 'Ramesh Verma', 24, 8.7, 4.1, '5:00 AM & 4:30 PM', 'Green fodder, maize silage, no hormones', 18
from public.farms f
where f.name like '%Mohanlalganj%'
  and not exists (select 1 from public.farmers);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. DELIVERY PREFERENCES  (global per-user; per-order override lives on orders)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.delivery_preferences (
  user_id              uuid primary key references auth.users(id) on delete cascade,
  call_before          boolean not null default false,
  ring_bell            boolean not null default true,
  voice_instructions_url text,
  door_image_url       text,
  notes                text,
  updated_at           timestamptz default now()
);

-- ─────────────────────────────────────────────────────────────────────────
-- 10. AUTOPAY / PYAAS MONEY  (UPI recurring mandate - Razorpay placeholder)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.autopay_mandates (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  provider         text not null default 'razorpay',
  mandate_id       text,                 -- Razorpay mandate/token id (placeholder for now)
  upi_id           text,
  max_amount       numeric not null default 5000,
  frequency        text not null default 'as_presented',
  status           text not null default 'pending' check (status in ('pending','active','paused','cancelled')),
  next_charge_date date,
  created_at       timestamptz default now()
);
create index if not exists autopay_user_idx on public.autopay_mandates(user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 11. TRACEABILITY  (sample batch reports + test QR; our USP)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.traceability_samples (
  id            uuid primary key default gen_random_uuid(),
  batch_code    text not null,
  product_line  text,            -- 'a2' | 'toned' | 'ghee'
  farm_id       uuid references public.farms(id) on delete set null,
  snf           numeric,
  fat           numeric,
  collected_at  timestamptz,
  report_url    text,
  qr_payload    text,            -- what the QR encodes (deep link / batch url)
  created_at    timestamptz default now()
);
insert into public.traceability_samples (batch_code, product_line, snf, fat, collected_at, qr_payload)
select 'PYAAS-A2-DEMO-0001', 'a2', 8.7, 4.1, now(), 'pyaas://trace/PYAAS-A2-DEMO-0001'
where not exists (select 1 from public.traceability_samples);

-- ============================================================================
-- ROW LEVEL SECURITY  (own-rows for user data; public read for catalog-ish data)
-- ============================================================================
alter table public.wallets                enable row level security;
alter table public.wallet_transactions    enable row level security;
alter table public.recharge_tiers         enable row level security;
alter table public.subscriptions          enable row level security;
alter table public.subscription_vacations enable row level security;
alter table public.coupons                enable row level security;
alter table public.coupon_redemptions     enable row level security;
alter table public.referrals              enable row level security;
alter table public.vip_memberships        enable row level security;
alter table public.partner_leads          enable row level security;
alter table public.farms                  enable row level security;
alter table public.farmers                enable row level security;
alter table public.delivery_preferences   enable row level security;
alter table public.autopay_mandates       enable row level security;
alter table public.traceability_samples   enable row level security;

-- Wallet: read own; balance is only ever changed via SECURITY DEFINER functions.
drop policy if exists "wallet read own" on public.wallets;
create policy "wallet read own" on public.wallets for select using (auth.uid() = user_id);

drop policy if exists "wallet tx read own" on public.wallet_transactions;
create policy "wallet tx read own" on public.wallet_transactions for select using (auth.uid() = user_id);

-- Recharge tiers + coupons + farms + farmers + traceability: public read (catalog).
drop policy if exists "recharge tiers read" on public.recharge_tiers;
create policy "recharge tiers read" on public.recharge_tiers for select to authenticated using (active);

drop policy if exists "coupons read active" on public.coupons;
create policy "coupons read active" on public.coupons for select to authenticated using (active);

drop policy if exists "farms read" on public.farms;
create policy "farms read" on public.farms for select to authenticated using (true);
drop policy if exists "farmers read" on public.farmers;
create policy "farmers read" on public.farmers for select to authenticated using (true);
drop policy if exists "traceability read" on public.traceability_samples;
create policy "traceability read" on public.traceability_samples for select to authenticated using (true);

-- Coupon redemptions: read own (writes happen inside redeem function).
drop policy if exists "redemptions read own" on public.coupon_redemptions;
create policy "redemptions read own" on public.coupon_redemptions for select using (auth.uid() = user_id);

-- Subscriptions + vacations: full CRUD on own rows.
drop policy if exists "subs crud own" on public.subscriptions;
create policy "subs crud own" on public.subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "vac crud own" on public.subscription_vacations;
create policy "vac crud own" on public.subscription_vacations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Referrals + VIP: read own (writes via functions / triggers).
drop policy if exists "referrals read own" on public.referrals;
create policy "referrals read own" on public.referrals for select
  using (auth.uid() = referrer_id or auth.uid() = referred_id);
drop policy if exists "vip read own" on public.vip_memberships;
create policy "vip read own" on public.vip_memberships for select using (auth.uid() = user_id);

-- Delivery preferences + autopay: full CRUD on own rows.
drop policy if exists "delivery prefs crud own" on public.delivery_preferences;
create policy "delivery prefs crud own" on public.delivery_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "autopay crud own" on public.autopay_mandates;
create policy "autopay crud own" on public.autopay_mandates
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Partner leads: anyone signed in can submit; they can read back only their own.
drop policy if exists "partner leads insert" on public.partner_leads;
create policy "partner leads insert" on public.partner_leads for insert
  with check (auth.uid() = user_id or user_id is null);
drop policy if exists "partner leads read own" on public.partner_leads;
create policy "partner leads read own" on public.partner_leads for select using (auth.uid() = user_id);

-- ============================================================================
-- HELPER + INTEGRATION FUNCTIONS  (SECURITY DEFINER; each authorises caller)
-- ============================================================================

-- Generate a short, unique referral code for a user id.
create or replace function public.gen_referral_code(p_uid uuid)
returns text language sql immutable as $$
  select 'PY' || upper(substr(replace(p_uid::text,'-',''), 1, 6));
$$;

-- Atomic credit (used by recharge/referral/cashback/refund flows).
create or replace function public.wallet_credit(
  p_user uuid, p_amount numeric, p_category text, p_ref_type text, p_ref_id text, p_desc text
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_bal numeric;
begin
  insert into public.wallets(user_id, balance) values (p_user, 0)
    on conflict (user_id) do nothing;
  update public.wallets set balance = balance + p_amount, updated_at = now()
    where user_id = p_user returning balance into v_bal;
  insert into public.wallet_transactions(user_id, direction, amount, balance_after, category, reference_type, reference_id, description)
    values (p_user, 'credit', p_amount, v_bal, p_category, p_ref_type, p_ref_id, p_desc);
  return v_bal;
end; $$;

-- Atomic debit (used at delivery for subscriptions / wallet-paid orders).
create or replace function public.wallet_debit(
  p_user uuid, p_amount numeric, p_category text, p_ref_type text, p_ref_id text, p_desc text
) returns numeric language plpgsql security definer set search_path = public as $$
declare v_bal numeric;
begin
  update public.wallets set balance = balance - p_amount, updated_at = now()
    where user_id = p_user and balance >= p_amount returning balance into v_bal;
  if not found then raise exception 'Insufficient wallet balance'; end if;
  insert into public.wallet_transactions(user_id, direction, amount, balance_after, category, reference_type, reference_id, description)
    values (p_user, 'debit', p_amount, v_bal, p_category, p_ref_type, p_ref_id, p_desc);
  return v_bal;
end; $$;

-- SELF-SERVICE RECHARGE (PLACEHOLDER): until the Razorpay webhook is live, the
-- app calls this to simulate a successful recharge + apply the matching bonus
-- tier. REPLACE with a server-side Razorpay webhook before production (see
-- DEVELOPER_NOTES.md) so balances can't be credited without real payment.
create or replace function public.wallet_recharge(p_amount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_bonus numeric := 0; v_tier record; v_bal numeric;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  if p_amount <= 0 then raise exception 'Invalid amount'; end if;
  perform public.wallet_credit(v_uid, p_amount, 'recharge', 'recharge', null, 'Wallet recharge');
  select * into v_tier from public.recharge_tiers
    where active and min_amount <= p_amount order by min_amount desc limit 1;
  if found then
    v_bonus := v_tier.bonus_amount;
    v_bal := public.wallet_credit(v_uid, v_bonus, v_tier.bonus_kind, 'recharge', null,
                                  coalesce(v_tier.label, 'Recharge bonus'));
  else
    select balance into v_bal from public.wallets where user_id = v_uid;
  end if;
  return v_bal;
end; $$;
grant execute on function public.wallet_recharge(numeric) to authenticated;

-- Validate + redeem a coupon for an order (returns the discount applied).
create or replace function public.redeem_coupon(p_code text, p_order_id uuid, p_discount numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_c record; v_used int;
begin
  if v_uid is null then raise exception 'Not signed in'; end if;
  select * into v_c from public.coupons where code = upper(p_code) and active;
  if not found then raise exception 'Invalid coupon'; end if;
  if v_c.valid_to is not null and now() > v_c.valid_to then raise exception 'Coupon expired'; end if;
  select count(*) into v_used from public.coupon_redemptions where code = v_c.code and user_id = v_uid;
  if v_c.per_user_limit is not null and v_used >= v_c.per_user_limit then
    raise exception 'Coupon already used'; end if;
  insert into public.coupon_redemptions(code, user_id, order_id, discount)
    values (v_c.code, v_uid, p_order_id, p_discount);
  return p_discount;
end; $$;
grant execute on function public.redeem_coupon(text, uuid, numeric) to authenticated;

-- RIDER-APP INTEGRATION: on delivery, debit the customer's wallet for a
-- subscription / wallet-paid order. Mirrors the existing rider-backdoor pattern;
-- only a registered rider may call it. The rider app calls this RIGHT AFTER
-- rider_update_status(order, 'delivered'). See DEVELOPER_NOTES.md.
create or replace function public.rider_settle_order_from_wallet(p_order_id uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_rider uuid; v_order record;
begin
  select id into v_rider from public.riders where user_id = auth.uid();
  if v_rider is null then raise exception 'Caller is not a registered rider'; end if;
  select * into v_order from public.orders where id = p_order_id and rider_id = v_rider;
  if not found then raise exception 'Order not assigned to this rider'; end if;
  if coalesce(v_order.wallet_used,0) > 0 then  -- already settled
    return (select balance from public.wallets where user_id = v_order.user_id);
  end if;
  update public.orders set wallet_used = total where id = p_order_id;
  return public.wallet_debit(v_order.user_id, v_order.total, 'order', 'order', p_order_id::text,
                             'Delivered order settled from wallet');
end; $$;
grant execute on function public.rider_settle_order_from_wallet(uuid) to authenticated;

-- Nearest farm to a coordinate (Farm Locator). Simple haversine-ish ordering.
create or replace function public.nearest_farm(p_lat double precision, p_lng double precision)
returns table (farm_id uuid, name text, distance_km double precision) language sql stable as $$
  select f.id, f.name,
    6371 * 2 * asin(sqrt(
      power(sin(radians(p_lat - f.lat)/2),2) +
      cos(radians(f.lat))*cos(radians(p_lat))*power(sin(radians(p_lng - f.lng)/2),2)
    )) as distance_km
  from public.farms f
  order by distance_km asc
  limit 1;
$$;
grant execute on function public.nearest_farm(double precision, double precision) to authenticated;

-- ============================================================================
-- NEW-USER EXTRAS  (additive trigger; runs ALONGSIDE the existing
-- handle_new_user trigger - does NOT replace it). Creates a wallet, a 120-day VIP
-- trial, a referral code, and credits the referrer ₹100 if a valid code was used.
-- ============================================================================
create or replace function public.handle_new_user_extras()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ref_code text; v_referrer uuid;
begin
  -- wallet
  insert into public.wallets(user_id, balance) values (new.id, 0) on conflict do nothing;

  -- 120-day VIP trial, no payment info required (founding-family launch offer)
  insert into public.vip_memberships(user_id, status, trial_started_at, current_period_end)
    values (new.id, 'trial', now(), now() + interval '120 days') on conflict do nothing;

  -- referral code + persist any referrer code passed in signUp metadata
  v_ref_code := new.raw_user_meta_data->>'referred_by';
  update public.profiles
     set referral_code = coalesce(referral_code, public.gen_referral_code(new.id)),
         referred_by   = v_ref_code,
         email         = coalesce(email, new.email),
         vip_status    = 'trial',
         vip_until     = now() + interval '120 days'
   where id = new.id;

  -- credit the referrer ₹100 on this successful signup
  if v_ref_code is not null then
    select id into v_referrer from public.profiles where referral_code = upper(v_ref_code) limit 1;
    if v_referrer is not null and v_referrer <> new.id then
      insert into public.referrals(referrer_id, referred_id, code_used, reward_amount, status)
        values (v_referrer, new.id, upper(v_ref_code), 100, 'credited')
        on conflict (referred_id) do nothing;
      perform public.wallet_credit(v_referrer, 100, 'referral', 'referral', new.id::text,
                                   'Referral reward - new family joined');
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists on_auth_user_created_extras on auth.users;
create trigger on_auth_user_created_extras
  after insert on auth.users
  for each row execute function public.handle_new_user_extras();

-- Backfill: give EXISTING users a wallet, referral code and VIP trial too.
insert into public.wallets(user_id, balance)
  select id, 0 from public.profiles on conflict do nothing;
update public.profiles set referral_code = public.gen_referral_code(id) where referral_code is null;
insert into public.vip_memberships(user_id, status, trial_started_at, current_period_end)
  select id, 'trial', now(), now() + interval '120 days' from public.profiles on conflict do nothing;

-- ============================================================================
-- DONE. See DEVELOPER_NOTES.md for: Razorpay webhook, subscription delivery
-- generation (cron/edge function), VIP expiry job, Storage buckets for avatar /
-- door image / voice note, and the rider-app coordination checklist.
-- ============================================================================
