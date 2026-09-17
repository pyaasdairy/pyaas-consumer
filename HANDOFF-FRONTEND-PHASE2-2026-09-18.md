# PYAAS consumer app — frontend phase 2 handoff

**Branch:** `feature/consumer-revamp-phase2`
**Date:** 18 September 2026
**Scope of this pass:** the founder's change list of 18 Sep (tester feedback from
Divyansh + the founder's own list). Frontend only. Every item below is
implemented, type-checks clean, and is built for both platforms.
**What this document is for:** the backend half. Sections marked **BACKEND**
are the contracts the app is already calling and will use the moment they
answer. Until then every one of them degrades silently — nothing in the UI
breaks, spins forever, or lies to the member.

---

## 1. What changed, item by item

| # | Ask | Where it lives now |
|---|-----|--------------------|
| 1 | Wordmark off the top-left, text flush left | `components/HomeHeader.tsx` |
| 2 | "Deliver to" shows the native locality, not the city | `lib/userLocation.ts` (`area`, `areaFromCoords`, `deliveryPlaceLabel`) |
| 3 | Wallet chip pink above ₹100, red below | `components/HomeHeader.tsx` + `lib/pricing.ts` (`balanceTier`) |
| 4 | "Your deliveries" day strip and "Add more subscription" gone from the hero | `app/(tabs)/index.tsx`; `components/DeliveryStrip.tsx` kept but unreferenced and marked deprecated |
| 5 | In-app notifications, live, with a bell that is always there | `lib/notificationCenter.ts`, `app/notifications.tsx`, header bell |
| 6 | OS / push notifications | `lib/notifications.ts` + `expo-notifications` installed and configured |
| 7 | Live tracking for instant orders, Blinkit-style | `lib/orderTracking.ts`, `components/LiveOrderCard.tsx` |
| 8 | Instant not available at night, without removing the lane | `lib/instantHours.ts` + the toggle in `app/(tabs)/index.tsx` |
| 9 | Instant reopening must show up immediately | 30-second forced serviceability poll while Home is focused |
| 10 | ₹500 minimum recharge, prefilled, nothing lower allowed | `lib/pricing.ts` (`MIN_RECHARGE`), `app/recharge.tsx`, `app/(tabs)/wallet.tsx` |
| 11 | Auto-pay offered before asking for a custom amount | `lib/autoTopup.ts`, `components/AutoTopupCard.tsx` |
| 12 | Tight low-balance funnel, critical red under ₹100 | Home banner, wallet banner, wallet chip |
| 13 | Confetti for 3-4 seconds when the free pack is claimed | `components/Fx.tsx` (`Confetti`) + the claim screen in `app/welcome-offer.tsx` |
| 14 | Complaint register for the customer | `lib/complaints.ts`, `app/complaints.tsx`, entry points on support + profile |
| 15 | Rate the app, and catch unhappy raters before the store | `lib/appReview.ts`, `components/RateAppSheet.tsx` |
| 16 | Help number in the offer terms → 96672 60050 | `components/OfferTermsSummary.tsx` (now derived from `lib/support.CARE_PHONE`) |
| 17 | "enjoyed on us" rewritten | `components/WelcomeProgressCard.tsx` → "free with our compliments" |
| 18 | Society address with dropdowns inside the launch township | `constants/societies.ts`, `components/Select.tsx`, `components/AddressCapture.tsx` |

Nothing else was touched. No pricing logic, no order placement, no wallet
ledger, no campaign funnel state machine.

---

## 2. The society address flow (the one that affects your data model)

**Why:** riders deliver a whole tower floor in one lift ride. A typed
"805, p4 blk" cannot be grouped by machine; `tower=P4, floor=8, unit=805` can.

**What the member sees:** when the confirmed map pin is inside the launch
township, step 2 of the address capture replaces the "Flat / House No" text box
with four dropdowns — Society → Tower → Floor → Flat — sourced from the
society's own unit directory. Country and the owner/tenant question from the
reference screenshot are deliberately not asked. There is always a "My flat is
not listed" link back to the typed field, because the directory has known gaps
and no member may be locked out of ordering by a missing row. Outside the
township the form renders exactly as it did before.

**The data:** `constants/societies.ts`, generated from
`chandra_panorama_MASTER_v2 (2).csv`. 746 units across four towers
(P1 162, P2 317, P3 123, P4 144). Non-residential rows (shops, commercial
spaces, utility rooms) are excluded; flats, merged flats (one door, two
numbers), villas and servant rooms are included, with the floor derived from the
unit number where the source row left it blank. Regenerate the same way when the
society publishes an update — the exported shape is the only contract.

### BACKEND: address fields

`POST /consumer/addresses` now receives five extra optional fields, and
`GET /consumer/addresses` should return them:

```json
{
  "line1": "P4-805",
  "line2": "8th floor, Chandra Panorama, Sushant Golf City",
  "society": "Chandra Panorama",
  "society_id": "chandra-panorama",
  "tower": "P4",
  "floor": 8,
  "unit": "805"
}
```

`line1`/`line2` are rendered from the same parts, so a consumer that only reads
the text lines still has a complete door. Please persist the structured fields
and expose them on the rider/operator side so a route can be grouped by
`(society_id, tower, floor)`. They are all nullable — a typed address sends
nulls. The app tolerates a backend that ignores them entirely.

---

## 3. Notifications

Two layers, deliberately separate.

**In-app feed (`lib/notificationCenter.ts`)** — works with no backend at all.
The app writes rows itself for the events it can observe: an order moving
through its states, a delivery landing, a wallet under the floor, a complaint
registered, the free litre claimed. Rows persist on device, carry an unread
count that drives the header bell and the iOS badge, and merge with your CRM
inbox (`GET /crm/inbox`) so members have one place to look instead of two.
`notify()` is idempotent by a `dedupe` key, which is why a 15-second poll
re-observing the same status is silent.

**OS layer (`lib/notifications.ts`)** — `expo-notifications`, wrapped in a lazy
`require` inside try/catch so a binary without the module degrades to
in-app-only rather than crashing. Android channels are created at boot
(`orders`, `delivery`, `wallet`, `offers`), so a member can mute offers and
still hear the rider. **Permission is only ever requested from the notifications
screen**, after a primer that says what we would send — never at launch.

### BACKEND: what is still owed

1. `POST /consumer/push/register { token, platform, provider }` — the app already
   calls this after permission is granted and swallows a 404. Store one row per
   device.
2. An FCM / APNs sender. Local notifications only fire while the process is
   alive; a member whose app is closed gets nothing until this exists. Android
   also needs `google-services.json` wired into the build before remote push can
   work at all (local notifications do not need it).
3. Ideally, reuse the same vocabulary as `NoticeKind`
   (`order | delivery | wallet | offer | account`) so an in-app row and a push
   describe one event and can be deduped against each other later.

---

## 4. Live order tracking

`useLiveOrders()` polls `GET /orders` every 15 seconds while the mounting screen
is alive, and stops on unmount — nothing ticks in the background. On every
status change it raises exactly one notification, persisted per order so a
relaunch never re-announces history.

The card (`components/LiveOrderCard.tsx`) shows a four-step rail that advances
with the reported status, a live pulse dot and a countdown derived from
`etaAt`/`eta_at`, falling back to placed + 20 minutes for the instant lane.

### BACKEND: nice-to-haves, in order of value

1. Keep minting `etaAt` on instant orders — the countdown is only honest because
   of it.
2. A push on each status transition (see above), so tracking works with the app
   closed. The app's own notification is the fallback while it is open.
3. Rider position on `GET /orders/{id}` would let the existing map animate; the
   tracker works without it.

---

## 5. Complaint register

Filing always succeeds from the member's side: the row is written on device with
a human reference (`PYS-XXXXX`), shown immediately under "My complaints", and
POSTed when a backend answers. Anything filed offline is marked "Waiting to
send" and retried on every refresh. Email escalation carries the same reference,
and the grievance officer from the Privacy Policy is printed at the bottom of
the screen.

### BACKEND: contract

```
POST /consumer/complaints { ref, category, order_id?, detail, photo_uri? }
     → { id, ref, status, created_at }
GET  /consumer/complaints
     → [{ id, ref, category, order_id, detail, status, resolution,
           created_at, updated_at }]

category: missing | quality | late | payment | rider | app | other
status:   open | in_review | resolved | closed
```

Server rows lead once they exist; `resolution` is rendered to the member
verbatim, so write it as something a customer should read. The client keeps
`queued` for its own not-yet-synced rows — you never need to send that value.

---

## 6. Recharge floor and auto top-up

`MIN_RECHARGE = 500` in `lib/pricing.ts` is the single source of truth. Presets
are ₹500 / ₹1,000 / ₹2,000 / ₹3,000 (the campaign's ₹300 tile is gone, because a
tile a member cannot choose has no business on the grid), the custom box opens
prefilled at ₹500, and the floor is enforced on the wallet screen, the recharge
screen and the CTA. A caller's shortfall can still raise the floor, never lower
it.

**Auto top-up is a WATCH, not a debit, and the copy says so.** The member picks
a threshold and an amount; `checkAutoTopup()` runs on every balance refresh and
raises one reminder a day with the amount pre-filled. Nothing is charged without
a tap.

### BACKEND: to make it a real mandate

The UPI AutoPay path already exists in `lib/autopay.ts` and
`/consumer/mandate/*`, but approval cannot complete against production, so the
mandate card stays `__DEV__`-only — shipping a button that claims to debit
automatically while approval fails is the dead payment flow App Review already
rejected once on this app. When recurring collection is live end to end: keep
`lib/autoTopup` as the source of truth for threshold + amount, swap the watch
for the mandate state, and the daily reminder becomes the pre-debit notice NPCI
requires.

---

## 7. Instant lane hours

`lib/instantHours.ts` publishes the window (06:00-23:00, both bounds
env-overridable). It is the floor **underneath** the store manager's toggle, not
a replacement: the backend's `instantClosed` / `instantResumesLabel` still close
the lane early or reopen it, and the client window stops the lane being
advertised at 2 AM when the backend is stale or silent.

Closed never means removed. The Instant segment keeps its place, dims, shows
"from 6:00 AM", and tapping it says *"Instant opens at 6:00 AM. Order for the
morning slot instead."* The note under the toggle names the hour and adds
"Morning delivery is open."

**The reopen delay Divyansh reported** was a client cache: serviceability was
keyed by point signature and only re-checked on a cold Home focus, so a store
manager reopening the lane took minutes to show. Home now force-re-checks every
30 seconds while it is on screen. If you want it instant rather than
near-instant, push a silent notification on a store-toggle change and the app
can re-check on receipt.

---

## 8. Builds, and what testing changed

**Artifacts from this pass** (both walked on a device/emulator, both carrying
Hermes bytecode 96):

| Platform | Version | Where |
|---|---|---|
| Android | 1.0.4, versionCode 40 | `~/Desktop/pyaas-apks/PYAAS-TEST-0918-0236-…-phase2-v104.apk` |
| iOS | 1.0.4, build 15 | installed on the iPhone 17 Pro from `Release-iphoneos/PYAAS.app` |

The version was moved to **1.0.4 / build 15 / versionCode 40** so these cannot
collide with 1.0.3 build 14, which is in App Review. Note that the local
`android/app/build.gradle` carries its own `versionCode` / `versionName` (the
native folders are gitignored and were last generated at 1.0.0); it is now in
step with `app.json`, but a Play release still goes through EAS remote
versioning, not these numbers.

**Five things the emulator walkthrough changed**, all of them worth knowing:

1. **Android notification permission has no "not asked yet" state.** A member
   who has never seen the dialog reads back as `denied` with
   `canAskAgain: true`, so the first version of the screen sent them to system
   settings for a switch they had never been offered. `permissionState()` now
   only calls it denied when it cannot be asked again.
2. **"Deliver to Sushant Golf City" did not fit.** On a 320dp screen it
   truncated to "Deliver to Sushant G…" — the preposition ate the only part
   that mattered. The header now prints the place alone next to the pin.
3. **Inside the township the geocoder answers "Sector B."** Precise, and
   useless for telling a member they are in our service area, so the township
   label now wins inside the fence.
4. **The dropdown kept its last search.** Reopening the floor list still
   filtered by what was typed before read as a list with rows missing.
5. **Complaint chips ellipsized** ("Problem wit…"). Labels are shorter and the
   chips now wrap to two lines.

## 9. Build and run

```bash
# Android (JDK 17 — Studio's JBR 25 breaks the worklets CMake build)
export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home
cd android && ./gradlew assembleRelease -x lint

# iOS (the new pod is already installed; re-run after any native dep change)
cd ios && pod install
```

Two standing rules for this repo, both learned the hard way:

1. **Always verify the Hermes bytecode version is 96** after a build —
   `head -c 12 <bundle> | xxd`, byte 8 must be `0x60`. A failed `hermesc`
   silently ships a stale bundle and the app crashes on launch with "Wrong
   bytecode version". The three halves of the Hermes 0.16 pairing are documented
   in `plugins/withHermesV1Disabled.js`.
2. **`adb install -r` silently fails over a differently-signed install.**
   `adb uninstall in.pyaasdairy.app` first.

`expo-notifications` was added this pass. Android picks it up through
autolinking and the module declares `POST_NOTIFICATIONS` itself, so no prebuild
was needed; iOS needed the `pod install` above.

---

## 10. Decisions worth knowing before you change something

- **The in-app feed is the source of truth, the OS layer is a convenience.**
  Every event writes a row whether or not notification permission was granted,
  so a member who said no still has a history.
- **Nothing asks for a permission at launch.** Location, camera and now
  notifications are all requested from a screen that explains itself first. App
  Review rejected build 9 over a pre-prompt that pre-committed the member.
- **The society directory is not authoritative.** Keep the "not listed" escape
  hatch on any surface that uses it.
- **`DeliveryStrip.tsx` is deprecated, not deleted.** The calendar can come back
  or move onto the subscriptions screen without rebuilding it. Do not re-mount
  it on Home without asking.
- **Two balance tiers, one threshold each** (`lib/pricing.balanceTier`): under
  ₹200 is a soft pink nudge, under ₹100 is red and says a delivery can be paused.
  No screen should invent its own number.
- **Launch-area labels are env-overridable** (`EXPO_PUBLIC_LAUNCH_AREA_LABEL`,
  `EXPO_PUBLIC_SERVICE_AREA_*`, `EXPO_PUBLIC_INSTANT_OPEN_HOUR`,
  `EXPO_PUBLIC_INSTANT_CLOSE_HOUR`), so the zone and the hours move without a
  release.

---

## 11. Still open

- Push sending and `google-services.json` (section 3).
- The complaints endpoints (section 5).
- Structured address fields persisted and exposed to the rider app (section 2).
- Real UPI AutoPay collection (section 6).
- The published Terms and Privacy PDFs still print the old `99996 80081`. The
  app now shows the registered number everywhere, so the **documents** are the
  stale ones and need reissuing.
