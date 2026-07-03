-- v8 — In-app account deletion (App Store 5.1.1(v) + Google Play requirement)
-- A signed-in user can permanently delete their own account and personal data.
-- SECURITY DEFINER so it can remove the auth.users row (RLS/anon cannot).
-- Most user tables FK auth.users ON DELETE CASCADE, but we delete the known
-- personal-data tables explicitly first so nothing is left behind even if a FK
-- isn't cascading, then drop the auth identity last.

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  delete from public.wallet_transactions     where user_id = uid;
  delete from public.wallets                  where user_id = uid;
  delete from public.subscription_vacations   where user_id = uid;
  delete from public.subscriptions            where user_id = uid;
  delete from public.coupon_redemptions       where user_id = uid;
  delete from public.vip_memberships          where user_id = uid;
  delete from public.delivery_preferences     where user_id = uid;
  delete from public.autopay_mandates         where user_id = uid;
  delete from public.addresses                where user_id = uid;
  delete from public.orders                   where user_id = uid;   -- order_items/events cascade
  delete from public.profiles                 where id = uid;

  -- finally the auth identity (cascades anything else still linked)
  delete from auth.users where id = uid;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
