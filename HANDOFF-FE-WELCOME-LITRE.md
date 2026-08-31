# FE Handoff — Welcome Litre self-serve funnel

**For:** Kushagra · **Backend:** `parag-saathi-be` `feature/crm-welcome-litre` @ `da0147c` (all endpoints live there, E2E-proven) · **Spec:** `PYAAS_Welcome_Litre_Campaign_Full.pdf` §15 + `PYAAS_Welcome_Litre_Offer_Terms.pdf` (Hindi binding)

## The one rule

**The frontend holds NO funnel truth.** No AsyncStorage claim/seen/eligibility gates — every
render decision comes from the server, so a reinstall, a second device, and an existing
customer all see exactly the right thing with zero local state. (Founder directive: nothing
saved locally except the cart.)

## Backend contract (all under the consumer base URL, consumer JWT)

### `GET /crm/eligibility` → `{"status": "..."}`
The single source of funnel truth. Render map:

| status | what the app shows |
|---|---|
| `eligible` | the Welcome Litre funnel (landing card + subscribe flow) |
| `already_enrolled` | the offer **progress card** (from `GET /crm/offer`) instead of any pitch |
| `not_eligible` | nothing — existing/paying household gets the normal app |
| `address_required` | funnel visible; CTA routes to address capture first, then re-probe |
| `not_serviceable` | funnel visible; CTA routes to the waitlist ("your offer stays available") |

Cache per focus like `getCrmOffer()` — never persist. Against the deployed pre-CRM backend
this route 404s → treat as `not_eligible` (funnel hidden, current behavior — same defensive
contract as `lib/crm.ts`).

### `POST /crm/enrol/self` → `crmEnrolResult`
Body (all optional — empty body = default plan, 2 × FCM 500 ml daily):

```json
{ "plan_product_id": "gold-500ml | gold-1l | taaza-500ml | taaza-1l",
  "plan_qty": 2, "plan_frequency": "daily | alternate", "society_id": "optional" }
```

Success → `{consumer_id, subscription_id, pack1_order_id, pack1_scheduled_for, ...}`.
The backend creates the subscription + the ₹0 pack-1 order + sends W-01 to the inbox —
**do NOT call `createSubscription` yourself for this flow**; the plan already exists after
this call (`syncServerSubscriptions()` will pull it into the local cache like the campaign
plans today).

Errors to handle: `ADDRESS_REQUIRED` (422 → address flow), `NOT_SERVICEABLE` (422 →
waitlist), `NOT_ELIGIBLE` (422 → hide funnel; show a friendly "offer is for new households"
if reached directly), `ALREADY_ENROLLED` (409 → show progress card), `BELOW_MILK_FLOOR`
(422 → the qty picker must not allow it anyway: **500 ml SKUs need qty ≥ 2, 1 L needs
qty ≥ 1**), `SKU_UNAVAILABLE` (422 → catalog gap, show retry).

Server enforces everything (one-per-phone **and per-address forever** — erase-and-resignup
is refused server-side; zone; paid-history). The FE never pre-checks locally.

## STATUS UPDATE — the LOGIC is already built and live-tested (do not rebuild it)

Everything below marked ✅ exists on this branch and was walked on the emulator against a
local CRM backend (fresh signup → home card → offer screen → consent grant verified in
Mongo). **Your job is UI/UX polish only — the states, routing and copy structure are
load-bearing compliance and must survive any redesign.**

- ✅ `lib/crm.ts`: `getWelcomeFunnelState()` (server-truth, null against old backend) +
  `startWelcomeLitre(plan)` (self-enrol + subscription sync + bell refresh).
- ✅ `lib/apiClient.ts`: `HttpError.code` now carries the backend's machine code — route on
  it, never parse messages.
- ✅ `app/welcome-offer.tsx`: the funnel screen — §15.7 terms summary, 4-plan menu,
  daily/alternate at equal weight, state-aware CTA (eligible → start; address_required →
  address flow; not_serviceable → waitlist note), bilingual via the DiscLang toggle.
- ✅ Home card in `app/(tabs)/index.tsx` (renders for eligible/address_required/
  not_serviceable) + focus-time `recheckWelcome()`.
- ✅ One-pitch invariant: `freePackShowEligible()` cedes whenever the backend speaks CRM,
  and `SubscriptionStatusCard`'s empty state is gated the same way — exactly one
  acquisition pitch can ever render.
- ✅ Marketing opt-in: unticked checkbox on complete-profile + the Message-preferences
  screen; a tick produces `marketing_sms`/`marketing_whatsapp` grants and an ACTIVE
  server-side `promotional` aggregate (verified in Mongo).

**Polish list for you (visual only):**
1. `welcome-offer.tsx` — hero treatment, imagery, animation; keep every terms line and
   the equal-weight frequency toggle.
2. The home funnel card — match your revamp visual language; keep the FREE pill + copy.
3. Recharge screen §6.4 is still yours end-to-end: ₹300 preset, "≈ N mornings"
   day-equivalents, equal-weight tiles, gateway-honest failure copy.
4. Offer progress card for `already_enrolled` (pack-1/pack-2 states from GET /crm/offer)
   — today the plan card + wallet chip + bell carry it; a dedicated card would be nicer.
5. Message-preferences screen styling.

## Screens (campaign doc §15, CCPA constraints in §16 — read both)

1. **Offer terms summary — BEFORE registration** (§15.7 verbatim content, Hindi first).
   This is the compliance hinge: who's eligible, what's free (2 × 500 ml FCM = 1 L), first
   pack with first delivery, ₹500 single recharge within 7 days for pack 2, subscription
   needed / no minimum period, one per number+address, area-limited, MRP unchanged
   ("additional quantity, not a discount"), support number. Reachable from the landing
   screen pre-OTP. `[ शर्तें देखें ]` links the full terms page.
2. **Landing/funnel card** (replaces the 2+2 pitch): §15.6 copy — "पहली सुबह 500 मि.ली. फुल
   क्रीम दूध मुफ़्त · ₹500 का पहला रिचार्ज — दूसरा 500 मि.ली. पैक भी मुफ़्त". Render only when
   eligibility says so (table above).
3. **Subscribe flow**: plan choice with **alternate-day at equal prominence** (§6.3/A-10),
   Toned/FCM, 500 ml/1 L. **No wallet gate, no ₹140 ask** — "No payment now" is the whole
   point. On success: confirmation per §15.8 ("कल सुबह 7 बजे तक आपका पहला पैक — मुफ़्त। कोई
   भुगतान नहीं।").
4. **Recharge screen** (§6.4/A-4): add the **₹300 preset**, show **day-equivalents** ("₹500
   ≈ 8 mornings"), all tiles **equal visual weight** (CCPA Interface Interference), failure
   copy must never claim "no money was deducted" unless the gateway confirmed.
5. **Offer progress card** (`already_enrolled`): pack-1/pack-2 state from `GET /crm/offer` +
   the wallet chip that already exists. After the qualifying recharge, W-04 arrives in the
   inbox **when the pack is attached to a real delivery morning** — if the plan is paused it
   comes later (≤ 14 days), so don't hard-code "tomorrow" in FE copy.

## Retiring the 2+2 pitch (surfaces only — engine stays)

- Gate `freePackShowEligible()` to return false whenever `GET /crm/eligibility` answers
  anything but a 404 (the new funnel owns acquisition wherever the backend speaks CRM; the
  2+2 remains only against the old deployed backend until the pin moves).
- Members **mid-2+2** keep their trial exactly as-is (backend engine untouched) — only the
  *pitch* (banner, popup, ClaimPackFlow entry) disappears.
- The local `free_pack_claims`/seen/snooze tables become dead — leave the data, delete the
  pitch call sites.

## Also in this backend drop (FYI, no FE work)

- Pack 2 rides the next real delivery (never a lone drop), 14-day cap when paused.
- Low-balance B-02 alert now fires just after **noon** (terms §5.3).
- `CRM_PACK2_MIN_PAISE` env knob for the ₹500→₹300 fallback (founder decision + terms
  republish first).

## Testing recipe

Local backend with `CRM_ENABLED=true` (see HANDOFF-CRM-2026-08-21.md in the BE repo for the
full loop: mongod + seed -minimal + store fixture). Walk: fresh user → eligibility
`address_required` → add address → `eligible` → funnel → subscribe (no money) → offer card +
W-01 in inbox → recharge ₹500 → W-04 → next morning both tasks. Then: paying account →
funnel absent; reinstall → identical state (nothing local).
