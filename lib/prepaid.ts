import { RECHARGE_TIERS, rechargeBonus, type RechargeTier } from './pricing';

/**
 * PREPAID FUNNEL — steer EXISTING members onto a healthy PREPAID wallet balance
 * (the Country-Delight model), rewarded with the instant top-up bonus. Prepaid
 * turns every morning delivery into a one-tap, no-daily-payment experience and
 * makes churn far less likely, so the app actively nudges members to load the
 * wallet to a "sweet-spot" target.
 *
 * The target is the recommended recharge tier (₹500 → ₹100 free by default). It
 * is illustrative, not fixed — set EXPO_PUBLIC_PREPAID_TARGET to any amount for a
 * pilot and the funnel + bonus copy follow it.
 */
export const PREPAID_TARGET: number = (() => {
  const raw = Number(process.env.EXPO_PUBLIC_PREPAID_TARGET);
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : 500;
})();

/** The recharge tier we steer members to (the target amount's bonus tier). */
export function prepaidTier(): RechargeTier {
  return (
    RECHARGE_TIERS.find((t) => t.amount === PREPAID_TARGET) ??
    rechargeBonus(PREPAID_TARGET) ??
    RECHARGE_TIERS[1]
  );
}

/**
 * Whether to run the prepaid funnel for this member. Targets EXISTING members —
 * an active subscription OR a wallet that has EVER been funded — whose prepaid
 * balance is below the target. A brand-new ₹0 account is never nagged here: it
 * sees the "2 + 2" trial funnel instead (see lib/freePack), so the two funnels
 * never fight over the same first-time user.
 */
export function shouldShowPrepaidFunnel(p: { balance: number; hasActiveSub: boolean; everFunded: boolean }): boolean {
  if (!(p.hasActiveSub || p.everFunded)) return false;
  return p.balance < PREPAID_TARGET;
}
