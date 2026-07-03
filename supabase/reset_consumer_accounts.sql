-- ============================================================================
-- PYAAS - CONSUMER reset (DEV).  Run in the shared project's SQL Editor.
--
-- ⚠️ SHARED DB: this project also powers the rider/Saathi app. This script is
-- deliberately SCOPED so it ONLY removes CONSUMER accounts and PRESERVES anyone
-- who is a rider / van / manager / onboarder (linked via riders.user_id or
-- app_users). It keeps the single test account below.
--
-- Review before running. It deletes data. Change KEEP_EMAIL if needed.
-- ============================================================================
do $$
declare
  keep_email text := 'test@gmail.com';
  v_keep uuid;
begin
  select id into v_keep from auth.users where email = keep_email limit 1;

  -- Build the set of consumer users to delete: has a profile, is NOT the keeper,
  -- and is NOT a rider/ops user.
  create temp table _to_delete on commit drop as
  select p.id
    from public.profiles p
   where (v_keep is null or p.id <> v_keep)
     and p.id not in (select user_id from public.riders where user_id is not null)
     -- preserve ops users if the rider app's app_users table exists
     and (to_regclass('public.app_users') is null
          or p.id not in (select id from public.app_users));

  -- Wipe their consumer data (FKs cascade most of this; explicit for safety).
  delete from public.wallet_transactions where user_id in (select id from _to_delete);
  delete from public.wallets             where user_id in (select id from _to_delete);
  delete from public.subscription_vacations where user_id in (select id from _to_delete);
  delete from public.subscriptions       where user_id in (select id from _to_delete);
  delete from public.coupon_redemptions  where user_id in (select id from _to_delete);
  delete from public.referrals           where referrer_id in (select id from _to_delete) or referred_id in (select id from _to_delete);
  delete from public.vip_memberships     where user_id in (select id from _to_delete);
  delete from public.delivery_preferences where user_id in (select id from _to_delete);
  delete from public.autopay_mandates    where user_id in (select id from _to_delete);
  delete from public.addresses           where user_id in (select id from _to_delete);
  -- orders/order_items/order_events cascade from auth.users delete:
  delete from auth.users where id in (select id from _to_delete);

  -- Clean the keeper: zero wallet, clear their consumer history for a fresh start.
  if v_keep is not null then
    delete from public.wallet_transactions where user_id = v_keep;
    update public.wallets set balance = 0, updated_at = now() where user_id = v_keep;
    insert into public.wallets(user_id, balance) values (v_keep, 0) on conflict (user_id) do update set balance = 0;
    delete from public.orders where user_id = v_keep;          -- order_items/events cascade
    delete from public.subscriptions where user_id = v_keep;
    delete from public.coupon_redemptions where user_id = v_keep;
  end if;
end $$;

-- Sanity check after running:
-- select email from auth.users order by created_at;
-- select user_id, balance from public.wallets;
