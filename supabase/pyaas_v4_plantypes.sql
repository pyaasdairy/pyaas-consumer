-- ============================================================================
-- PYAAS v4 - allow a 'one_time' subscription plan type.
-- Run once in the shared Supabase project's SQL Editor (additive, idempotent).
-- A 'one_time' plan delivers a single time (the ops nightly job should mark it
-- 'cancelled' after generating its one order).
-- ============================================================================
alter table public.subscriptions drop constraint if exists subscriptions_frequency_check;
alter table public.subscriptions
  add constraint subscriptions_frequency_check
  check (frequency in ('daily','alternate','weekly','custom','one_time'));
