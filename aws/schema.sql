-- ============================================================================
-- PARAG Consumer App — AWS RDS PostgreSQL 16 schema
-- Target: Amazon RDS for PostgreSQL (or Aurora PostgreSQL Serverless v2),
-- same engine/version as infra/aws/terraform/data-stores.tf (postgres 16).
-- No Supabase, no auth.users, no RLS-via-auth.uid(). Authorization happens in
-- the NestJS API layer (JWT access/refresh, same pattern as apps/api) — every
-- query is already scoped by the authenticated user_id from the verified JWT.
-- Safe to re-run (all statements are idempotent).
-- ============================================================================

create extension if not exists pgcrypto; -- gen_random_uuid()

-- ── 1. USERS ─────────────────────────────────────────────────────────────────
create table if not exists users (
  id            uuid primary key default gen_random_uuid(),
  phone         text unique not null,
  email         text unique,
  full_name     text,
  password_hash text,                 -- null when phone-OTP-only login
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── 2. OTP CODES (phone verification for login/signup) ─────────────────────
create table if not exists otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  purpose     text not null default 'login' check (purpose in ('login','signup')),
  expires_at  timestamptz not null,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists otp_codes_phone_idx on otp_codes(phone, created_at desc);

-- ── 3. REFRESH TOKENS (JWT rotation / revocation) ───────────────────────────
create table if not exists refresh_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  jti         text not null unique,
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists refresh_tokens_user_idx on refresh_tokens(user_id);

-- ── 4. ADDRESSES ─────────────────────────────────────────────────────────────
create table if not exists addresses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  label       text not null default 'Home',
  line1       text not null,
  line2       text,
  city        text not null,
  pincode     text not null,
  lat         double precision,
  lng         double precision,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists addresses_user_idx on addresses(user_id);

-- ── 5. CATEGORIES ────────────────────────────────────────────────────────────
create table if not exists categories (
  id          text primary key,        -- slug, e.g. 'milk', 'dahi'
  label       text not null,           -- display label, e.g. 'Dahi'
  sort_order  integer not null default 0,
  active      boolean not null default true
);

insert into categories (id, label, sort_order) values
  ('milk',            'Milk',            10),
  ('dahi',            'Dahi',            20),
  ('paneer',          'Paneer',          30),
  ('ghee',            'Ghee',            40),
  ('butter',          'Butter',          50),
  ('chaach',          'Chaach',          60),
  ('flavoured_milk',  'Flavoured Milk',  70),
  ('mattha',          'Mattha',          80),
  ('lassi',           'Lassi',           90),
  ('sweets',          'Sweets',          100),
  ('super_tea',       'Super Tea',       110)
on conflict (id) do nothing;

-- ── 6. PRODUCTS (catalog is DB-backed, not a static TS file — needed so the
--     app can scale to 1L+ users and prices/stock can change without a build) ─
create table if not exists products (
  id            text primary key,       -- sku slug, e.g. 'taaza-1l'
  category_id   text not null references categories(id),
  name          text not null,          -- e.g. 'Toned Milk - Parag Taaza'
  variant       text not null,          -- e.g. '1 L'
  unit          text not null,          -- e.g. '1000 ml'
  price         numeric(10,2) not null,
  mrp           numeric(10,2),          -- null/equal to price when no discount
  tag           text,
  description   text,
  image_url     text,
  subscribable  boolean not null default false,
  sort_order    integer not null default 0,
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists products_category_idx on products(category_id, active, sort_order);

-- ── 7. RIDERS ────────────────────────────────────────────────────────────────
create table if not exists riders (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid unique references users(id) on delete set null,
  full_name    text not null,
  phone        text not null,
  vehicle      text,
  rating       numeric(2,1) default 4.8,
  is_online    boolean not null default true,
  current_lat  double precision,
  current_lng  double precision,
  updated_at   timestamptz not null default now(),
  created_at   timestamptz not null default now()
);

insert into riders (full_name, phone, vehicle, rating, current_lat, current_lng)
select 'Ram Kumar', '+919999900000', 'Bike · UP32 CD 5678', 4.8, 26.8467, 80.9462
where not exists (select 1 from riders);

-- ── 8. ORDERS ────────────────────────────────────────────────────────────────
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  status          text not null default 'placed'
                    check (status in ('placed','confirmed','preparing','assigned','out_for_delivery','delivered','cancelled')),
  subtotal        numeric(10,2) not null default 0,
  delivery_fee    numeric(10,2) not null default 0,
  discount        numeric(10,2) not null default 0,
  total           numeric(10,2) not null default 0,
  payment_method  text not null default 'cod',
  coupon_code     text,
  address_label   text,
  address_text    text,
  rider_id        uuid references riders(id) on delete set null,
  placed_at       timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists orders_user_idx  on orders(user_id, placed_at desc);
create index if not exists orders_rider_idx on orders(rider_id);

-- ── 9. ORDER ITEMS ───────────────────────────────────────────────────────────
create table if not exists order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  product_id  text not null references products(id),
  name        text not null,
  variant     text,
  price       numeric(10,2) not null,
  qty         integer not null check (qty > 0)
);
create index if not exists order_items_order_idx on order_items(order_id);

-- ── 10. ORDER EVENTS (status timeline) ───────────────────────────────────────
create table if not exists order_events (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  status      text not null,
  note        text,
  created_at  timestamptz not null default now()
);
create index if not exists order_events_order_idx on order_events(order_id);

create or replace function log_order_event()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT') then
    insert into order_events(order_id, status) values (new.id, new.status);
  elsif (new.status is distinct from old.status) then
    new.updated_at := now();
    insert into order_events(order_id, status) values (new.id, new.status);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_order_event_ins on orders;
create trigger trg_log_order_event_ins
  after insert on orders
  for each row execute function log_order_event();

drop trigger if exists trg_log_order_event_upd on orders;
create trigger trg_log_order_event_upd
  before update on orders
  for each row execute function log_order_event();

-- ── 11. COUPONS ──────────────────────────────────────────────────────────────
create table if not exists coupons (
  id                uuid primary key default gen_random_uuid(),
  code              text unique not null,
  description       text,
  discount_type     text not null check (discount_type in ('flat','percent')),
  discount_value    numeric(10,2) not null,
  min_order_value   numeric(10,2) not null default 0,
  max_discount      numeric(10,2),
  usage_limit       integer,
  per_user_limit    integer not null default 1,
  valid_from        timestamptz not null default now(),
  valid_until       timestamptz,
  active            boolean not null default true
);

create table if not exists coupon_redemptions (
  id          uuid primary key default gen_random_uuid(),
  coupon_id   uuid not null references coupons(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  order_id    uuid references orders(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists coupon_redemptions_user_idx on coupon_redemptions(coupon_id, user_id);

-- ── 12. MILK SUBSCRIPTIONS ───────────────────────────────────────────────────
create table if not exists subscriptions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  product_id   text not null references products(id),
  address_id   uuid references addresses(id) on delete set null,
  frequency    text not null default 'daily' check (frequency in ('daily','alternate')),
  qty          integer not null default 1 check (qty > 0),
  start_date   date not null,
  status       text not null default 'active' check (status in ('active','paused','cancelled')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists subscriptions_user_idx on subscriptions(user_id);

create table if not exists subscription_vacations (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references subscriptions(id) on delete cascade,
  start_date       date not null,
  end_date         date not null,
  created_at       timestamptz not null default now()
);
create index if not exists sub_vac_subscription_idx on subscription_vacations(subscription_id);

-- ── 13. WALLET ───────────────────────────────────────────────────────────────
create table if not exists wallets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references users(id) on delete cascade,
  balance     numeric(10,2) not null default 0,
  updated_at  timestamptz not null default now()
);

create table if not exists wallet_transactions (
  id          uuid primary key default gen_random_uuid(),
  wallet_id   uuid not null references wallets(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  type        text not null check (type in ('credit','debit')),
  amount      numeric(10,2) not null check (amount > 0),
  reason      text,
  order_id    uuid references orders(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists wallet_tx_user_idx on wallet_transactions(user_id, created_at desc);

-- ============================================================================
-- PRODUCT CATALOG SEED — extracted from the Parag Dairy (Pradeshik Cooperative
-- Dairy Federation, UP) storefront screenshots. MRP == Offer Price on every
-- SKU in the source screenshots (no live discounts), so mrp is set equal to
-- price throughout — do not invent discount percentages.
-- ============================================================================
insert into products (id, category_id, name, variant, unit, price, mrp, tag, subscribable, sort_order) values
  -- Milk
  ('taaza-500ml', 'milk', 'Toned Milk - Parag Taaza', '500 ml', '500 ml', 29.00, 29.00, '3% Fat · Toned', true, 10),
  ('taaza-1l',    'milk', 'Toned Milk - Parag Taaza', '1 L',    '1000 ml', 57.00, 57.00, '3% Fat · Toned', true, 11),
  ('taaza-5l',    'milk', 'Toned Milk - Parag Taaza', '5 L',    '5000 ml', 285.00, 285.00, '3% Fat · Toned · Bulk pack', true, 12),
  ('gold-500ml',  'milk', 'Full Cream Milk - Parag Gold', '500 ml', '500 ml', 35.00, 35.00, 'Full Cream', true, 20),
  ('gold-1l',     'milk', 'Full Cream Milk - Parag Gold', '1 L',    '1000 ml', 69.00, 69.00, 'Full Cream', true, 21),

  -- Dahi (curd)
  ('dahi-sweet-90g',   'dahi', 'Sweet Dahi', '90 g',  '90 g',  10.00, 10.00, 'Sweet', false, 30),
  ('dahi-sweet-200g',  'dahi', 'Sweet Dahi', '200 g', '200 g', 24.00, 24.00, 'Sweet', false, 31),
  ('dahi-plain-90g',   'dahi', 'Plain Dahi', '90 g',  '90 g',  10.00, 10.00, 'Plain', false, 32),
  ('dahi-plain-200g',  'dahi', 'Plain Dahi', '200 g', '200 g', 23.00, 23.00, 'Plain', false, 33),
  ('dahi-plain-400g',  'dahi', 'Plain Dahi', '400 g', '400 g', 35.00, 35.00, 'Plain', false, 34),
  ('dahi-plain-5kg',   'dahi', 'Plain Dahi - Low Fat (Bucket)', '5 kg',  '5000 g',  400.00,  400.00,  'Low Fat · Bucket', false, 35),
  ('dahi-plain-15kg',  'dahi', 'Plain Dahi - Low Fat (Bucket)', '15 kg', '15000 g', 1050.00, 1050.00, 'Low Fat · Bucket · Bulk', false, 36),
  ('dahi-pp-400g',     'dahi', 'Dahi PP', '400 g', '400 g', 35.00, 35.00, 'Poly Pack', false, 37),

  -- Paneer
  ('paneer-1kg',      'paneer', 'Paneer', '1 kg',  '1000 g', 410.00, 410.00, null, false, 40),
  ('paneer-vac-100g', 'paneer', 'Paneer (Vacuum Pack)', '100 g', '100 g', 45.00, 45.00, 'Vacuum Pack', false, 41),
  ('paneer-vac-200g', 'paneer', 'Paneer (Vacuum Pack)', '200 g', '200 g', 90.00, 90.00, 'Vacuum Pack', false, 42),

  -- Ghee
  ('ghee-poly-200ml', 'ghee', 'Ghee - Poly Pack', '200 ml',  '200 ml',  130.00, 130.00, 'Poly Pack', false, 50),
  ('ghee-poly-500ml', 'ghee', 'Ghee - Poly Pack', '500 ml',  '500 ml',  320.00, 320.00, 'Poly Pack', false, 51),
  ('ghee-poly-1l',    'ghee', 'Ghee - Poly Pack', '1000 ml', '1000 ml', 630.00, 630.00, 'Poly Pack', false, 52),
  ('ghee-sika-500ml', 'ghee', 'Ghee - Sika Pack', '500 ml',  '500 ml',  325.00, 325.00, 'Sika Pack', false, 53),
  ('ghee-sika-1l',    'ghee', 'Ghee - Sika Pack', '1000 ml', '1000 ml', 640.00, 640.00, 'Sika Pack', false, 54),

  -- Butter
  ('butter-100g', 'butter', 'Butter', '100 g', '100 g', 54.00,  54.00,  null, false, 60),
  ('butter-500g', 'butter', 'Butter', '500 g', '500 g', 260.00, 260.00, null, false, 61),

  -- Chaach
  ('chaach-500ml', 'chaach', 'Chaach', '500 ml', '500 ml', 20.00, 20.00, 'Buttermilk', false, 70),

  -- Flavoured Milk
  ('flavoured-milk-200ml', 'flavoured_milk', 'Flavoured Milk', '200 ml', '200 ml', 15.00, 15.00, null, false, 80),

  -- Mattha
  ('mattha-200ml', 'mattha', 'Mattha', '200 ml', '200 ml', 13.00, 13.00, null, false, 90),

  -- Lassi
  ('lassi-200g', 'lassi', 'Lassi', '200 g', '200 g', 20.00, 20.00, null, false, 100),

  -- Sweets
  ('ladoo-besan-250g', 'sweets', 'Besan Ladoo',  '250 g', '250 g', 125.00, 125.00, null, false, 110),
  ('kheer-chhena-100g','sweets', 'Chhena Kheer', '100 g', '100 g', 30.00,  30.00,  null, false, 111),
  ('peda-250g',        'sweets', 'Peda',         '250 g', '250 g', 125.00, 125.00, null, false, 112),
  ('milk-cake-250g',   'sweets', 'Milk Cake',    '250 g', '250 g', 125.00, 125.00, null, false, 113),
  ('rasgolla-200g',    'sweets', 'Rasgolla',     '200 g', '200 g', 64.00,  64.00,  null, false, 114),
  ('rasgolla-500g',    'sweets', 'Rasgolla',     '500 g', '500 g', 160.00, 160.00, null, false, 115),
  ('gulab-jamun-200g', 'sweets', 'Gulab Jamun',  '200 g', '200 g', 80.00,  80.00,  null, false, 116),
  ('gulab-jamun-500g', 'sweets', 'Gulab Jamun',  '500 g', '500 g', 200.00, 200.00, null, false, 117),
  ('rice-kheer-100ml', 'sweets', 'Rice Kheer',   '100 ml','100 ml',20.00,  20.00,  null, false, 118),
  ('shree-khand-100g', 'sweets', 'Shree Khand',  '100 g', '100 g', 25.00,  25.00,  null, false, 119)
on conflict (id) do update set
  category_id = excluded.category_id, name = excluded.name, variant = excluded.variant,
  unit = excluded.unit, price = excluded.price, mrp = excluded.mrp, tag = excluded.tag,
  subscribable = excluded.subscribable, sort_order = excluded.sort_order, updated_at = now();

-- NOTE: "Super Tea" category exists in the source nav but no product/price was
-- visible in the provided screenshots — left with zero SKUs on purpose rather
-- than inventing a price. Add real SKUs here once you have the source data.
