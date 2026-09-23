# PYAAS consumer app — frontend handoff, 21 September 2026

**Branch:** `feature/ui-revamp` (fast-forward of `feature/consumer-revamp-phase2`, pushed 22 Sep at the founder's request)
**For:** the co-developer syncing the backend.
**Scope:** the founder's change list of 21 September. Frontend only; every
item is built for iOS and Android and type-checks clean. Sections marked
**BACKEND** are what the app now calls or relies on. Until those exist, each
feature degrades quietly: nothing crashes, nothing shows made-up data.

Sources the founder supplied, all in the repo root:
`pyaas-app-spec.md` + `pyaas-app-screens.html` (Founding Family),
`pyaas-one-voice.md` (all customer wording), `PYAAS_ app Taglines .pdf`,
`Celebrity_Gardens_Lucknow_All_Towers.csv`.

---

## 1. Urgent: duplicate "Scheduled" orders (money)

**What the founder saw:** one active subscription (2 × Parag Gold, ₹72) and a
growing list of ₹72 "Scheduled" orders, several on the same evening.

**What I could establish from code** (I could not read the founder's rows; the
review test account on production has no orders):

1. **Past-day orders never close.** The subscription worker locks tomorrow's
   order at midnight and creates the delivery task, but nothing closes a locked
   order if no rider marks it delivered. `EXPIRE` only cancels *unlocked*
   previews. So every past morning stays `placed` and the app listed each one as
   "Scheduled".
2. **Nothing stops a second subscription for the same product.** Server
   `createSubscription` inserts unconditionally, and the worker creates a daily
   order for *every* active subscription. A second "Subscribe" on the same milk
   doubles the daily order and the charge, while the app's merged list can still
   look like one plan.

**Frontend fixes (done):**
- Orders tab and the home tracker show **active orders only**: not delivered,
  not cancelled, and the delivery day has not passed
  (`lib/orderTracking.isActive`). Display only; no order is changed.
- The app refuses a second active or paused subscription for the same product
  (`lib/subscriptions.createSubscription`, error code `DUPLICATE_SUBSCRIPTION`).

**BACKEND — please:**
1. Pull the founder's account and check for more than one active subscription
   on the same product. Cancel the extras and their still-open orders before any
   of them is delivered, since `settleDeliveredOrders` debits per order.
2. Make `createSubscription` reject a duplicate active or paused subscription for
   the same consumer and product (return `DUPLICATE_SUBSCRIPTION`).
3. Decide what happens to a locked order whose day passed undelivered, and close
   it so it stops reading as live.

---

## 2. Cut-off is 12 noon the day before

One Voice §1.2 and the founder: **12 noon the day before, for everything** (new
orders, changes, pauses, skips). App copy now says so: the subscriptions
screen, the product-page banner and the start-date picker.

**BACKEND:** the worker still enforces an 11:59 PM edit law (lock at the first
tick after midnight; tomorrow's preview is scheduled from 13:00). Move the lock
to 12:00 noon the day before, and apply the same cut-off to new morning orders,
so the copy and the behaviour agree.

---

## 3. Founding Family (replaces PYAAS Plus)

Built from `pyaas-app-spec.md` screens 4 to 7: the centre PYAAS button opens
**Founding Family** (non-members) or **You're in** (members); Pick your farm;
Join, pay ₹99. The animated card with the member's name is kept, relabelled
FOUNDING FAMILY; on the member screen its foil number is the place in line.
"PYAAS Plus", "VIP" and "priority slots" are gone from the app. The old 10%
member discount on milk is removed on the client (`memberLinePrice` returns
the regular price): Parag is always MRP, and the PYAAS-milk member price is
level 3, which the server applies.

Rule one of the spec is enforced: the app never types a farm, seat count,
status or price. With no backend answer, the screen says "Founding Family opens
in the app soon".

**BACKEND — contract the app calls** (`lib/foundingFamily.ts`):

```
GET  /consumer/founding-family
  → {
      price_month: 99,
      member: null | { status: "waiting"|"active"|"stopped", farm_id,
                       line_number, referral_code, joined_at, next_bill_date },
      farms: [{ id, name, farmer, place, note, photo_url,
                unlocks_at, claimed, status: "filling"|"unlocked",
                unlocked_packs }],
      savings: { level1_per_litre, level3_per_litre, delivery_fee }   // optional
    }

POST /consumer/founding-family/join { farm_id }
  → { member }      // take ₹99 from the wallet, book against FOUNDING-99,
                    // status Waiting, assign line number
  errors (HttpError code): WALLET_SHORT, FARM_UNLOCKED, ALREADY_MEMBER

POST /consumer/founding-family/stop
  → { member }      // perks run to the end of the paid month
```

Everything in spec §5 (enforcement), §6 (notification texts), §8 (moving
today's Plus members) and §9 (ERP items) is server work. The app shows
`savings` as "1 L a day saves ₹X a month" only when you send it.

The share link uses the mock's path, `pyaasdairy.com/foundationfamily?ref=CODE`.
Confirm that route exists on the website.

**Not built this pass** (spec screens 1, 2, 3, 8, 9: Shop lock state, Parag
product offer copy, wallet step 2, PYAAS-milk product states, member basket).
The founder asked for the Founding Family section; those were listed back to
them to confirm.

---

## 4. Notifications

| What | How | Backend |
|---|---|---|
| Rating prompt | The OS's own sheet (`expo-store-review`, installed): iOS "Enjoying PYAAS?", Android Play in-app review. After 3 delivered orders, 60-day cooldown. Profile "Rate the app" opens the store page. The custom star sheet is deleted (Apple 5.6.1). | none |
| Order updates | Swiggy-style: title "Arriving in 24 mins" / "Arriving by 7:30 AM", body the status ("Your order is accepted", "Rider is on the way to pick up"). One live notification per order; each update replaces it. | Send your closed-app pushes in the **same shape**, with identifier `order:<id>`. |
| "Your cart is waiting" | Zomato-style, 30 min after leaving the app with items in the cart: "5 items • ~20 mins • ₹827", with a **View Cart** button. Cancelled on return. No product image (not supported on Android by expo-notifications). | none |
| Taglines | The PDF's lines every 2 hours in random order, from the groups that apply: cart lines only with items in the cart, "browsed and left" lines only for members with no orders and no subscription, "Kinda chic" for everyone. Next 3 days scheduled on each backgrounding. | none |
| Taps | A tapped notification now opens what it is about (order, cart, recharge). | none |

Taglines and the cart reminder are **local** notifications scheduled by the
phone: no server and no per-message cost. They respect the Offers switch and OS
permission.

The **Messages** screen is retired (its campaign rows are already in
Notifications). `/inbox` redirects to `/notifications`, and a campaign row now
opens its own CTA.

---

## 5. Referrals

"Refer and earn" did not work because it ran entirely on the phone: the code
was derived on-device, the ledger was never filled, and an entered code was
only stored locally. It stays, and now:
- asks new members for a referral code at sign-up (complete-profile, optional),
- calls the server first and falls back locally,
- shares a One Voice message (master line, before 7 AM, and the welcome offer
  with its condition, per One Voice §1.8).

**BACKEND:**
```
GET  /consumer/referrals/code   → { code }
GET  /consumer/referrals        → [{ id, name, status, reward_amount, created_at }]
POST /consumer/referrals/apply  { code }
```
Codes already shared were derived on-device as
`('PG' + base36(hash(uid)).toUpperCase() + 'XXXX').slice(0, 6)` with
`hash = h*31 + charCode, unsigned 32-bit` over the consumer id
(`lib/referrals.codeFromUid`). Issue the same code for existing members so those
links keep attributing.

**Conflict for the founder:** the Refer screen says "Gift ₹100, get ₹100",
while spec §5.8 and One Voice say a referral moves you up the Founding Family
line with no cash or credit. Not changed; needs a decision.

---

## 6. Society addresses: Celebrity Gardens added

`constants/societies.ts` now lists **Celebrity Gardens** (13 towers A–R, 728
flats, 4 per floor, ground to 13th) beside Chandra Panorama, from the founder's
CSV. The CSV has no map location, so Celebrity Gardens is picked from the
Society list and never auto-selected from a pin. Send coordinates and it will
be. Address rows carry `society_id: "celebrity-gardens"`; the structured fields
are unchanged from the 18 Sep handoff.

---

## 7. Earn with PYAAS (P-DAN) and Bulk order

- "Partner with us" is now **Earn with PYAAS**, the PYAAS Digital Agent Network
  (P-DAN), named per One Voice §1.9. Franchise and Distributor are removed.
- **Bulk order** is its own screen: name and phone pre-filled, product chips
  (milk, curd, paneer), one-time or every day, a quantity field.

**BACKEND:** `POST /consumer/partner-leads` must accept `kind: "agent"`.
Bulk orders still arrive as `kind: "bulk_order"`, with the chips and quantity
in `message`.

---

## 8. Smaller changes

- Morning/Instant reads as two separate tabs (each on its own raised plate).
- Home: one box tracks every active order; the Welcome Litre progress box is
  removed; Instant has a clear demarcation.
- Wallet has a back button (tabs now use `backBehavior="history"`).
- Email updates removed from Message preferences (no email is collected; the
  `email` consent key stays false so the record shape is unchanged).
- Message preferences (offers, WhatsApp, SMS) are **on by default** for new
  members; the sign-up opt-in is pre-ticked. **Founder was told** this conflicts
  with DPDP "clear affirmative action", TRAI TCCCPR explicit consent for
  promotional SMS/WhatsApp, and Apple 4.5.4 for promotional notifications.
- Auto top-up is **on by default** (members who switched it off keep that).
- FAQs moved onto Help & support; the repeated Chat / Customer Care / FAQ rows
  are gone from the profile.
- Terms and Privacy now show **exactly** the text at www.pyaasdairy.com
  (`scripts/sync-legal.py` → `constants/legal.ts`; re-run after any website
  edit). Grievance contact synced to the website: "Grievance Officer, Pyaas
  Dairy Private Limited", support@pyaasdairy.com.
- Em dashes: none left in any on-screen app string.

---

## 9. BACKEND: copy the app shows from the server

Em dashes the founder wants gone that come from **backend** strings a consumer
can see (OTP and rate-limit errors surface on the sign-in screen):

- `identity/service.go`: "a code was just sent — please wait…", "no active OTP
  for this phone — request a new code", "too many incorrect OTP attempts —
  request a new code", "refresh token expired — log in again",
  "this mobile number is not registered yet — contact…"
- `middleware/ratelimit.go`: "too many requests — slow down"

Also check CRM templates and serviceability reasons for the same.

---

## 10. Found while syncing (for the founder, not changed)

- **CIN differs**: the website prints `U46302UW2026PTC255483`; the app's
  seller block, invoices and FSSAI screen use `U46302UP2026PTC255483`. `UP` is
  the Uttar Pradesh code; the website looks like the typo. The in-app Terms now
  show the website's text, so fix it at the source.
- Website Terms still say the cut-off is "typically the night before" and the
  slot "before 8:00 a.m."; One Voice says 12 noon and before 7 AM.
- Website support hours (Mon–Sat 9–6, Sun 8–1) differ from One Voice (7 AM to
  9 PM, all days).

---

## 11. Build notes

- New native modules this pass: `expo-store-review` (pod installed).
  `expo-notifications` came in on 18 Sep.
- Verify Hermes bytecode after every build: **iOS 96** (byte 8 = `0x60`),
  **Android 98** (`0x62`).
- `adb uninstall in.pyaasdairy.app` before installing a differently-signed APK.
