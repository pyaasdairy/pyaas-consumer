# RELEASE.md — store-compliance invariants (Parag Consumer, public app). Do not break these.

- targetSdk = 36 (floor 35+, Android). iOS: PrivacyInfo.xcprivacy present + accurate.
- PAYMENTS: physical goods. NO Apple IAP, NO Google Play Billing (grep
  BillingClient/StoreKit/SKPayment must stay empty). Gateway (UPI/cards via
  RBI-authorised aggregator) only. The wallet buys ONLY physical dairy —
  closed-loop, single-merchant; NEVER describe or build it as a "digital wallet"
  and never let it buy anything digital.
- LOCATION: WHEN-IN-USE only. NO ACCESS_BACKGROUND_LOCATION. No iOS "Always".
  Purpose: find the serving store / show the rider while an order is on the way.
- ACCOUNT DELETION: real in-app flow — settle/return wallet balance, cancel
  subscriptions + UPI mandates, anonymise PII, retain only legally-required
  financial records (RBI 10y / GST / Companies Act).
- LEGAL METROLOGY: every product listing shows net quantity, MRP inclusive of
  all taxes, manufacturer/packer name & address, country of origin,
  consumer-care details, best-before.
- FSSAI licence, seller identity, grievance officer, support email + toll-free —
  live URLs AND reachable in-app.
- AI (Parag Care): name the provider + consent BEFORE sending user text. Never
  send Aadhaar/card/precise-geo/wallet data to the model. Deterministic fallback
  must work.
- PERMISSIONS: contextual prompts + specific purpose strings. No unused permissions.
- Ask before adding ANY new permission, SDK, or "digital" wallet feature.
