-- ============================================================================
-- PYAAS Consumer App - Supabase schema (SEPARATE project from the website)
-- Paste this whole file into the Supabase SQL Editor of your APP project and
-- run it once. Safe to re-run. Then put the project's URL + anon key into the
-- app's .env file (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).
-- ============================================================================

-- ── 1. PROFILES ─────────────────────────────────────────────────────────────
-- One row per signed-up consumer, linked to Supabase Auth.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  phone       text,
  created_at  timestamptz default now()
);

-- Auto-create a profile row whenever a new auth user signs up. The full_name and
-- phone come from the metadata the app passes to supabase.auth.signUp().
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'phone'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. ADDRESSES ────────────────────────────────────────────────────────────
create table if not exists public.addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  label       text not null default 'Home',
  line1       text not null,
  line2       text,
  city        text not null,
  pincode     text not null,
  lat         double precision,
  lng         double precision,
  is_default  boolean not null default false,
  created_at  timestamptz default now()
);
create index if not exists addresses_user_idx on public.addresses(user_id);

-- ── 3. RIDERS (the backdoor for the future Rider app) ───────────────────────
-- The Rider app will authenticate riders and map them here via user_id. For now
-- we seed one demo rider so the consumer app can show the "your rider" flow.
create table if not exists public.riders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references auth.users(id) on delete set null, -- set by rider app later
  full_name    text not null,
  phone        text not null,
  vehicle      text,
  rating       numeric(2,1) default 4.8,
  is_online    boolean default true,
  current_lat  double precision,
  current_lng  double precision,
  updated_at   timestamptz default now(),
  created_at   timestamptz default now()
);

insert into public.riders (full_name, phone, vehicle, rating, current_lat, current_lng)
select 'Suresh Yadav', '+919999988888', 'Bike · UP32 AB 1234', 4.9, 26.8467, 80.9462
where not exists (select 1 from public.riders);

-- ── 4. ORDERS ───────────────────────────────────────────────────────────────
create table if not exists public.orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  status          text not null default 'placed'
                    check (status in ('placed','confirmed','preparing','assigned','out_for_delivery','delivered','cancelled')),
  subtotal        numeric not null default 0,
  delivery_fee    numeric not null default 0,
  total           numeric not null default 0,
  payment_method  text not null default 'cod',
  address_label   text,
  address_text    text,
  rider_id        uuid references public.riders(id) on delete set null,
  placed_at       timestamptz default now(),
  updated_at      timestamptz default now()
);
create index if not exists orders_user_idx on public.orders(user_id);
create index if not exists orders_rider_idx on public.orders(rider_id);

-- ── 5. ORDER ITEMS ──────────────────────────────────────────────────────────
create table if not exists public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  product_id  text not null,
  name        text not null,
  variant     text,
  price       numeric not null,
  qty         integer not null check (qty > 0)
);
create index if not exists order_items_order_idx on public.order_items(order_id);

-- ── 6. ORDER EVENTS (status timeline) ───────────────────────────────────────
create table if not exists public.order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders(id) on delete cascade,
  status      text not null,
  note        text,
  created_at  timestamptz default now()
);
create index if not exists order_events_order_idx on public.order_events(order_id);

-- Log an event whenever an order is created or its status changes.
create or replace function public.log_order_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (tg_op = 'INSERT') then
    insert into public.order_events(order_id, status) values (new.id, new.status);
  elsif (new.status is distinct from old.status) then
    new.updated_at := now();
    insert into public.order_events(order_id, status) values (new.id, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_order_event_ins on public.orders;
create trigger trg_log_order_event_ins
  after insert on public.orders
  for each row execute function public.log_order_event();

drop trigger if exists trg_log_order_event_upd on public.orders;
create trigger trg_log_order_event_upd
  before update on public.orders
  for each row execute function public.log_order_event();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table public.profiles     enable row level security;
alter table public.addresses    enable row level security;
alter table public.riders       enable row level security;
alter table public.orders       enable row level security;
alter table public.order_items  enable row level security;
alter table public.order_events enable row level security;

-- Profiles: a user can read/update only their own profile.
drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles self update" on public.profiles for update using (auth.uid() = id);

-- Addresses: full CRUD on your own rows.
drop policy if exists "addresses crud" on public.addresses;
create policy "addresses crud" on public.addresses
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Riders: any signed-in user can READ rider info (so you can see your rider's
-- name, phone and live location). Writes happen only via the rider app / RPCs.
drop policy if exists "riders read" on public.riders;
create policy "riders read" on public.riders for select to authenticated using (true);

-- Orders: a user can create and read their own orders, and update only to
-- cancel while the order is still cancellable. Rider-side status changes go
-- through SECURITY DEFINER functions below (which bypass RLS safely).
drop policy if exists "orders insert own" on public.orders;
drop policy if exists "orders read own"   on public.orders;
drop policy if exists "orders cancel own" on public.orders;
create policy "orders insert own" on public.orders for insert with check (auth.uid() = user_id);
create policy "orders read own"   on public.orders for select using (auth.uid() = user_id);
create policy "orders cancel own" on public.orders for update
  using (auth.uid() = user_id and status in ('placed','confirmed'))
  with check (auth.uid() = user_id);

-- Order items: readable/insertable when the parent order is yours.
drop policy if exists "order_items read own"   on public.order_items;
drop policy if exists "order_items insert own" on public.order_items;
create policy "order_items read own" on public.order_items for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));
create policy "order_items insert own" on public.order_items for insert
  with check (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- Order events: readable when the parent order is yours.
drop policy if exists "order_events read own" on public.order_events;
create policy "order_events read own" on public.order_events for select
  using (exists (select 1 from public.orders o where o.id = order_id and o.user_id = auth.uid()));

-- ============================================================================
-- RIDER BACKDOOR FUNCTIONS
-- These are the integration points the future Rider (Android) app will call.
-- They are SECURITY DEFINER so they can update orders/riders past RLS, but each
-- one authorises the caller first.
-- ============================================================================

-- DEMO: lets a consumer simulate a rider picking up THEIR OWN order so the
-- "connected with your rider" experience can be tested before the rider app
-- exists. Picks the demo rider and moves the order out for delivery.
create or replace function public.simulate_rider_assignment(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rider uuid;
begin
  -- only the order's owner may simulate
  if not exists (select 1 from public.orders where id = p_order_id and user_id = auth.uid()) then
    raise exception 'Not your order';
  end if;

  select id into v_rider from public.riders where is_online order by created_at limit 1;
  if v_rider is null then
    raise exception 'No rider available';
  end if;

  update public.orders
     set rider_id = v_rider,
         status   = 'out_for_delivery'
   where id = p_order_id;
end;
$$;
grant execute on function public.simulate_rider_assignment(uuid) to authenticated;

-- REAL (for the Rider app): a rider claims an unassigned, confirmed order.
-- The rider must have a row in public.riders linked to their auth user_id.
create or replace function public.rider_claim_order(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rider uuid;
begin
  select id into v_rider from public.riders where user_id = auth.uid();
  if v_rider is null then
    raise exception 'Caller is not a registered rider';
  end if;

  update public.orders
     set rider_id = v_rider, status = 'assigned'
   where id = p_order_id and rider_id is null
     and status in ('confirmed','preparing','placed');

  if not found then
    raise exception 'Order not available to claim';
  end if;
end;
$$;
grant execute on function public.rider_claim_order(uuid) to authenticated;

-- REAL (for the Rider app): update the status of an order the rider owns.
create or replace function public.rider_update_status(p_order_id uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_rider uuid;
begin
  select id into v_rider from public.riders where user_id = auth.uid();
  if v_rider is null then
    raise exception 'Caller is not a registered rider';
  end if;
  if p_status not in ('assigned','out_for_delivery','delivered') then
    raise exception 'Invalid status';
  end if;

  update public.orders
     set status = p_status
   where id = p_order_id and rider_id = v_rider;

  if not found then
    raise exception 'Order not assigned to this rider';
  end if;
end;
$$;
grant execute on function public.rider_update_status(uuid, text) to authenticated;

-- REAL (for the Rider app): push the rider's live GPS location.
create or replace function public.rider_update_location(p_lat double precision, p_lng double precision)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.riders
     set current_lat = p_lat, current_lng = p_lng, updated_at = now()
   where user_id = auth.uid();
end;
$$;
grant execute on function public.rider_update_location(double precision, double precision) to authenticated;

-- ============================================================================
-- OPTIONAL: realtime. Enable Realtime on the "orders" table in the Supabase
-- dashboard (Database -> Replication) if you want push updates instead of the
-- app's 5-second polling. The consumer app already refetches on a timer.
-- ============================================================================
