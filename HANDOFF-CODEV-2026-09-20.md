# Consumer app — handoff, 20 September 2026

**The full handoff lives in the backend repo:**
`parag-saathi-be/docs/HANDOFF-CODEV-2026-09-20.md` — branches, audit findings, the CRM
trigger table, push status, deploy order and the device test plan. Read that first.
This file is only the consumer-app half, and it continues
`HANDOFF-FRONTEND-PHASE2-2026-09-18.md` (whose §11 "Still open" list is now partly
answered by the backend).

---

## Branch

`feature/consumer-revamp-phase2`, two fix commits on top of the 18–20 Sep push.

## What was fixed here

- **MONEY — a member could be charged for a delivery the rider undid.** An undo
  deliberately frees the wallet charge so a genuine re-delivery can bill again; the
  settle sweep, working from a list up to 15 seconds stale, could take that freed slot
  and charge at the app's own sticker total — and on a free Welcome Litre pack the row
  is not marked `trial_free`, so the existing guard missed it. Live tracking polls four
  times a minute, which turned a rare race into a routine one. The sweep now skips
  anything delivered inside the rider's 15-minute undo window plus a 5-minute margin,
  and a **missing** `delivered_at` means *wait*, not *charge*.
- **STORE POLICY — the rating sheet filtered by sentiment**: 4–5 stars to the store,
  1–3 into the complaint box, never seeing the store. Apple and Google both forbid it,
  on an app already removed from Play once. Every rating now sees the store **and** the
  "tell us what went wrong" box.
- **₹500** — the cart quoted "recharge ₹40" and then the recharge screen clamped to
  ₹500. The cart now quotes what we actually ask for and says the rest stays in the
  wallet.
- **"Auto top-up" → "Low-balance reminder"**, with "nothing is charged until you pay"
  above the switch instead of after it. It is a reminder; the old name promised a
  mandate we do not have.
- **Per-account storage** for the reminder and the rating flags. On a shared phone the
  next member inherited the previous one's armed threshold, and one person's star
  rating silenced the ask for everybody after them. Both also outlived account deletion.
- **`.specstory/` gitignored** — it holds full AI session transcripts, which quote
  `.env` values.

Verify: `npx tsc --noEmit` clean.

## Phase B persistence

The backend is the source of truth. After the phase B commits on this branch, what the
app still keeps on the device in backend mode is:

- **The cart** (`store/cart.ts`).
- **Auth tokens** (SecureStore, `lib/apiClient.ts`) and the **session pointer**
  (`parag_current_uid`, plus the OTP-verified login digits the reviewer gate reads).
- **UI preferences**: disclosure language, the low-balance reminder setting, the
  rating-ask flags, the free-pack seen / snooze flags, the setup-done gate flag, the
  order-status seen markers, the local-data version stamp.
- **Device-scoped disclosure records** by design (`lib/dataConsent.ts`,
  `lib/locationConsent.ts`), and the `consents` rows as the device's record of what the
  member tapped; the message-preferences screen renders the server's consent state
  (`lib/consentSync.ts`).
- **Offline outboxes**, each row deleted once its replay lands:
  - address create -> `addr-create` (`lib/api.ts`); a set-default or delete that could not
    reach the server is queued by server id (`addr-default`, `addr-delete`);
  - subscription create -> `sub-create` (`lib/subscriptions.ts`); `sub-status` and
    `sub-edit` drop any op an older build queued (the server is the source of truth; a
    queued auto-resume must not land on a plan the server has since paused);
  - profile edit -> `profile` (`lib/profileApi.ts`);
  - delivery preferences -> `delivery-prefs` (`lib/deliveryPrefs.ts`), the changed keys only;
  - consents -> `consents` (`lib/consentSync.ts`);
  - complaints -> replayed by `useComplaints.refresh` (`lib/complaints.ts`), not the mirror
    queue; a permanent rejection deletes the row and is shown once;
  - promo credits -> `replayPendingPromos` (`lib/walletApi.ts`); restock leads ->
    `replayParkedRestockLeads` (`lib/leads.ts`).
- **Owner-decided device-local items**: `user_location`, `milk_scans`, favorites, the
  local notices feed (`lib/notificationCenter.ts`), and the `vip` row (`lib/vip.ts`): no
  `GET /membership` exists, so a row an older build wrote is the only evidence anywhere of
  a Plus month that build debited from the server wallet. Backend mode ignores it
  (`getVip` null, `isPlusActive` false) and sign-out spares it (`lib/session.ts`); it is
  neither read nor deleted until the server owns membership.

Everything else a screen shows in backend mode is an in-memory copy of a server read
(profile, address book, plan list, delivery prefs, trial, mandate, wallet unlock, offer
qualification), keyed by account and cleared on sign-out.

Behaviour consequences the reviewer listed:

- Offline in a session that has not yet read `GET /addresses`, the address list is the
  outbox only. Nothing local stands in for the server's book; the next read retries.
- `addVacation` needs a live plan on the server. With none it throws ("Start a
  subscription first") instead of writing a local range.

Also worth knowing:

- Low-balance auto-pause is no longer decided on the phone. The server worker skips a
  day the wallet cannot cover and the CRM's B-01 / B-02 triggers message the member; the
  app only shows the reminder.
- `PATCH /me` replaces the whole `delivery_prefs` document with what it is sent
  (`service.go updateMe`), so the delivery-prefs replay lays the queued keys over a fresh
  `GET /me` before it sends. A true partial PATCH needs the backend to merge.
- How a replay classifies an error (`mirrorOutcomeFor`, `lib/mirrorQueue.ts`): network,
  timeout, no status, 5xx, 408 and 429 retry; 401 (a token refresh that failed or timed
  out) and 403 (a stale app key) also retry, because they are session states, not
  verdicts on the row; every other 4xx drops the row, since a retry can never land it.
  Every outbox keeps its row on 401/403 (complaints, addresses, subscriptions, profile,
  delivery prefs, consents, leads); promos never drop. The saves that feed the outboxes
  throw a drop to the screen instead of queuing it, and each replay deletes its row on
  a drop; delivery prefs now follow that rule too.
- Sign-out zeroes the wallet store (`resetWallet`, `store/wallet.ts`), so the next member
  never sees the previous balance. The store records the account a successful refresh was
  for (`loadedUid`) and discards a read whose account changed in flight, and the purchase
  unlock (`lib/walletGate.ts`) latches for the session only from such a refresh or from
  the ledger; a balance a caller passes in answers that one check and never latches.

## The backend now answers three of your §11 items

- **`POST` / `GET /consumer/complaints`** exist, with an operator surface at
  `/consumer/admin/crm/complaints` so a person actually reads them and writes the
  `resolution` the member sees verbatim. Filing is idempotent per `(consumer, ref)`, so
  your offline retry returns the same ticket instead of a second one.
- **`POST /consumer/push/register`** exists and matches what the app sends. It stores
  the token; it cannot send anything yet (see below). The response says
  `"delivery":"pending_sender"`.
- **Structured address** — `society`, `society_id`, `tower`, `floor`, `unit` are stored,
  returned by `GET /addresses`, and copied onto the delivery task.

## Still open in this repo

**Push — nothing server-initiated reaches anybody today**

1. **`eas init`** — `app.json` has no `extra.eas.projectId`, so `getExpoPushTokenAsync()`
   throws on every device and **zero tokens exist**. Founder/account-level.
2. **Firebase project + `google-services.json` + `android.googleServicesFile`.**
3. **APNs key** for iOS.
4. **Call `registerForPush()` at boot and after sign-in**, not only from the settings
   screen.
5. **A tap handler** — nothing registers `addNotificationResponseReceivedListener`, so
   the `href` packed into each notification goes nowhere.
6. **Unbind on sign-out** (needs `DELETE /consumer/push/register` on the backend), or a
   shared phone keeps notifying the previous member.
7. **An Android notification icon** — Android currently draws a white square.

**Other**

- Stale "Delivered" burst when switching accounts.
- `autoTopup`'s legacy-key migration is read-only: re-save under the scoped key, and
  call `clearAutoTopup` on sign-out (it has no call sites today).
- Opening the notifications screen re-POSTs `read` for every CRM row, every time.
- The complaint photo is a device-local `file://` URI that is never uploaded, so the
  operator sees nothing.
- Cart copy still overstates the unlock requirement (the gate is ₹100; ₹500 is the
  minimum top-up).
- Terms and Privacy PDFs still print `99996 80081`; the app shows the registered number.
- Three Welcome Litre creatives are out of rotation pending artwork.

## Worth knowing

With no push and only two DLT templates registered (W-01 enrolment, W-07 offer
expiring), **the in-app inbox is the only channel for almost every CRM message**. A
member finds out when they open the app. Order-confirmed, out-for-delivery and
delivered messages have no code behind them at all. Full table in the backend handoff §5.
