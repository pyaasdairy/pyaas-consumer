-- v7 — Rider delivery contact RPC
-- Returns the customer's name + phone for an order, but ONLY to the rider
-- assigned to it (the join on rd.user_id = auth.uid() enforces that). SECURITY
-- DEFINER so it can read public.profiles, which RLS otherwise hides from a rider.
-- Powers the "Call customer" button in the delivery-rider screen (app/rider/[id].tsx).

create or replace function public.rider_order_contact(p_order_id uuid)
returns jsonb language sql security definer set search_path = public as $$
  select jsonb_build_object('name', pr.full_name, 'phone', pr.phone)
    from orders o
    join riders rd on rd.id = o.rider_id and rd.user_id = auth.uid()
    join profiles pr on pr.id = o.user_id
   where o.id = p_order_id;
$$;

revoke execute on function public.rider_order_contact(uuid) from public, anon;
grant execute on function public.rider_order_contact(uuid) to authenticated;
