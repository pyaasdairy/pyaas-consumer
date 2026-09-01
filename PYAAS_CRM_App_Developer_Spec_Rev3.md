# PYAAS CRM — developer specification, revision 3

## The Welcome Litre campaign increment

**20 August 2026 · For the app and backend team · read alongside revision 2, which remains in force**

> **This is an increment, not a replacement.** Revision 2 specifies the whole CRM and nothing in it is withdrawn. This document specifies only what the Welcome Litre campaign changes — twenty items, CH-01 to CH-20. Anything not named here is unchanged and revision 2 governs it.
>
> **Ships with:** `pyaas_crm_triggers_v3.json` — 54 triggers (was 43), 46 templates (was 37). Every rule below is already encoded there. **Read the config, do not retype it.**

---

## 0. Read this before you estimate

**One change is load-bearing and everything else depends on it.**

The CRM was built for a customer who pays first and is delivered second. The campaign inverts that: the customer subscribes with **₹0 deliberately**, is delivered free milk the next morning, and is asked for money only afterwards. For the first 24–48 hours of a campaign customer's life, **a zero wallet balance is the designed state, not a failure state.**

Four triggers currently fire against that design and tell the customer something untrue. **Do not patch them individually.** Implement CH-01 and all four become correct with no special-casing.

**Estimating note.** CH-01, CH-04 and CH-19 are backend and data-model work with no UI. CH-05 is trigger configuration plus template registration. The rest are small. **The DLT template approval in §6 is the long pole and does not depend on any of the code** — file it in parallel, on day one.

---

## 1. CH-01 · Entitlement counts as cover — the blocking change

### 1.1 The rule

```
days_of_cover = (topup_balance + promo_credit_spendable) / daily_order_value
                + entitled_free_deliveries_remaining
```

`entitled_free_deliveries_remaining` is an integer derived from the offer state, not a stored counter that can drift:

```
pack1_state == 'pending'                       →  1
pack2_state == 'pending'  (recharge settled,
                           delivery not yet made) →  +1
otherwise                                      →  0
```

### 1.2 Where it is read

`days_of_cover` is computed in **one place** and consumed by B-01, B-02, D-07 and the wallet screen. If you find yourself writing `if (offer_id == 'welcome_litre')` inside a trigger condition, stop — the abstraction is in the wrong place.

| Consumer | Current behaviour | After CH-01 |
|---|---|---|
| B-01 low balance, 09:00 daily | Fires on day 0 — wrong | Silent until the free deliveries are spent |
| B-02 insufficient at cut-off, 17:00 | Fires on day 0 — wrong | Silent until the free deliveries are spent |
| D-07 skip notice, 12:00 | Would compute `tomorrow.delivery_blocked = true` on day 0 — wrong | Correct; fires at noon on day 1 if unrecharged |
| Wallet balance screen | Shows ₹0 and "delivery at risk" | Shows ₹0 **and** "1 free delivery remaining" |

### 1.3 The one trigger that needs a condition as well

A-05 (*subscription selected, not paid*) is not driven by days of cover — it compares balance against the first cycle amount. It gets an explicit second condition:

```json
"conditions": [
  "wallet.topup_balance < plan.first_cycle_amount",
  "offer.entitled_free_deliveries_remaining == 0"
]
```

**A-05 is not disabled.** It is the correct message for every non-campaign signup and must keep working. Without the second condition it fires **two hours after a campaign signup** and tells the customer that tomorrow's delivery needs a payment — when tomorrow's delivery is already coming free, and a promoter said so at their door an hour earlier.

---

## 2. CH-19 · Data model

### 2.1 `customer` — new columns

```sql
ALTER TABLE customer
  ADD COLUMN offer_id            text     NULL,     -- 'welcome_litre' | NULL
  ADD COLUMN offer_enrolled_at   timestamptz NULL,
  ADD COLUMN offer_pack1_state   text     NULL,     -- pending|delivered|forfeited
  ADD COLUMN offer_pack2_state   text     NULL,     -- locked|pending|delivered|expired
  ADD COLUMN offer_society_id    text     NULL,
  ADD COLUMN offer_promoter_id   text     NULL,
  ADD COLUMN offer_asset_type    text     NULL,     -- poster|standee|hanger|whatsapp|promoter
  ADD COLUMN address_hash        text     NULL,     -- normalised address + geocode bucket
  ADD COLUMN device_first_seen   text     NULL,
  ADD COLUMN has_paid_order      boolean  NOT NULL DEFAULT false;

CREATE INDEX ON customer (address_hash) WHERE address_hash IS NOT NULL;
CREATE INDEX ON customer (offer_id, offer_pack2_state);
```

`has_paid_order` exists because two win-back journeys now depend on it (§5.4). Set it true on the first order whose settled value is greater than zero — **never on a promotional-only order.**

### 2.2 The offer state machine

```
                subscription.activated (campaign cohort)
                              │
                              ▼
                  pack1 = pending, pack2 = locked
                              │
                  promotional order delivered
                              ▼
                  pack1 = delivered      ─── 7 days elapse, no settled recharge ≥ ₹500 ──▶ pack2 = expired
                              │
        wallet.recharge_settled ≥ ₹500, within 7 days
                              ▼
                       pack2 = pending
                              │
              order carrying the promotional line delivered
                              ▼
                       pack2 = delivered
```

**Every transition emits `offer_pack_state_change {pack_no, from, to, reason}`.** State is a column, never inferred at read time — a report that recomputes state from order history will disagree with the trigger engine the first time a delivery is back-dated.

**`packs_in_entitlement` is configuration** (`config.offer.welcome_litre.packs_in_entitlement`, currently `2`). The work order grants *"one litre FCM"* and does **not** say two 500 ml packs. If the union supplies a single 1-litre pack, setting this to `1` must make W-04 through W-07 no-op and collapse the offer to one free morning. **Do not compile the number two into anything.**

### 2.3 New derived segments

Computed nightly, never hand-set, consistent with revision 2 §2.6.

| Segment | Predicate |
|---|---|
| `welcome_pack1_delivered` | `offer_pack1_state='delivered' AND has_paid_order=false` |
| `welcome_completed` | `offer_pack2_state='delivered'` |
| `welcome_lapsed` | `offer_pack1_state='delivered' AND has_paid_order=false AND days_since_first_delivery > 7` |
| `waitlist_out_of_area` | registered, last serviceability check `in_zone=false` |

**`welcome_lapsed` is not `inactive`.** They never paid, so they were never active. Win-back journeys (C-02, F-08) now carry `customer.has_paid_order == true`, which keeps a failed trial out of a churn journey — and keeps it out of the retention denominator, where it would flatter the number until somebody believed it.

---

## 3. CH-04 · Promotional packs must exist in the ledger

**A free pack handed over off-ledger has no order line.** C-01 resolves `{labelled_product}` from the order line and revision 2 is explicit that a message which cannot resolve its supply source **must fail rather than fall back**. So W-02 and W-05 would fail to render — and, far worse, a quality concern on a free pack would have no batch for E-05 to stop.

**Every promotional pack is a zero-value order line:**

```json
{
  "sku": "PARAG-FCM-500ML",
  "batch": "<from hub receipt>",
  "expiry": "<from hub receipt>",
  "supply_source": "parag",
  "unit_price_paise": 0,
  "promotional_value_paise": 3600,
  "is_promotional": true,
  "proof_of_delivery": { "type": "otp|photo", "captured_at": "<ts>" }
}
```

Two derived flags the triggers read:

```
order.is_promotional_only      = every line has is_promotional = true
order.contains_promotional_line = any line has is_promotional = true
```

**This also gives the campaign's fraud controls their evidence for free.** Proof of delivery attaches to an order; daily reconciliation becomes a query; the promoter-level free-to-cancel rate becomes computable rather than anecdotal.

**Accounting.** Invoiced cost nil, promotional value at MRP disclosed separately — the same two figures the financial model keeps apart, so the books, the CRM and the model read one record.

---

## 4. Event catalogue additions — CH-20

Reconcile the campaign's fourteen events with the revision 2 catalogue into **one list before either is built.** Two event catalogues in one product is how a dashboard ends up disagreeing with itself. The campaign's list is more specific and wins where they overlap. Three additions it does not have:

```
offer_enrolled           {offer_id, society_id, promoter_id, asset_type}
offer_pack_state_change  {pack_no, from, to, reason}
entitlement_reconciled   {date, packs_issued, consumers_created, variance}
```

Plus these, which the trigger engine needs to fire on:

```
wallet.recharge_settled  {amount_paise, method, settled_at}   ← distinct from recharge_succeeded
serviceability.checked   {pincode, in_zone}
abuse_flag_raised        {rule, entity, entity_id}
```

**`wallet.recharge_settled` is a new event and is not the same as `recharge_succeeded`.** W-04 fires on settlement, never on payment initiation — releasing a free pack on initiation is trivially exploitable and is the exact hole the campaign's fraud table closes.

**Privacy, unchanged and non-negotiable:** no UPI handle, no VPA, no account number, no full address in any analytics payload.

---

## 5. CH-05 · The W triggers

All eleven are in `pyaas_crm_triggers_v3.json` under `section: "W"`, `phase: 1`. Below is only what is not obvious from the config.

### 5.1 W-03a and W-03b are one moment in two categories — CH-06

The 10:30 message on day one is the most important message in the campaign, and **its DLT category is genuinely ambiguous.** The first half is a service reminder about the customer's own subscription against a real cut-off. The second half offers something free. The categories classify by **content, not by the sender's intent**, and content that offers a benefit reads as promotional — which pulls the whole message into explicit consent, the 10 am–9 pm window, DND scrub and the 90-day bar.

**Build it as two registered templates and choose at dispatch:**

```
10:30  T-W03a  service_implicit  — sent unconditionally
10:32  T-W03b  promotional       — sent only if consent.promotional.valid
                                    AND no opt-out within 90 days
                                    AND no open complaint
```

A customer without promotional consent still receives the recharge prompt and still sees the pending pack **on the screen the link opens**, which is where the offer is already disclosed. **Never make the offer conditional on marketing consent** — that is Forced Action, one of the five dark patterns the CCPA has actually penalised.

**Ask the DLT aggregator to classify the combined wording formally, in writing.** If they confirm service-explicit, collapse the two templates into one and save a step. Do not build on a verbal opinion; the enforcement threshold is five complaints in ten days.

### 5.2 W-02 replaces D-06 on the free delivery — CH-08

D-01, D-02 and D-06 all gain `order.is_promotional_only == false`.

Without it a campaign customer receives **four messages before noon on their first morning** — order confirmed, out for delivery, delivered, cut-off prompt — and the first two say nothing W-01 did not. **The first morning is exactly two touches: W-02 at 07:30 and W-03a at 10:30.**

This is the only place in the system that caps by *occasion* rather than by category. It exists because day one is the day a household decides whether we are a service or a nuisance.

### 5.3 W-07 must send, and its wording is not editable

W-07 fires at day 7 for a customer who never recharged, sets `pack2_state = expired`, and says — in whatever language they chose — **"nothing has been charged."**

**This line is mandatory and must not be shortened out by a template reviewer.** A customer who received free milk and then stopped hearing from us will assume something was debited. The message that closes the offer is the cheapest complaint-prevention in the whole campaign.

### 5.4 W-09 and W-10 send nothing to a customer

They exist so the campaign's fraud controls and daily stock reconciliation land in the same engine with the same audit trail, rather than in a spreadsheet.

**W-09 flags, it never auto-rejects.** Genuine multi-family households exist, especially in older Lucknow properties. Support may approve a second offer at the same address on evidence of a separate household — **build that review path before launch.** A rule with no appeal generates complaints nobody can answer.

**W-10 is the campaign's stop-loss.** Promotional stock that cannot be reconciled to consumers created halts the campaign, so it needs an event and an alert, not a month-end discovery.

### 5.5 No new AI-call trigger, deliberately

F-03 gains `offer.entitled_free_deliveries_remaining == 0` and a script rule: **it must not mention the free pack.** A call whose purpose is to offer something free is a promotional call in substance whatever it is labelled, and adding one would pull AI calling into promotional consent, DND scrub and the 90-day bar in exchange for reaching a handful of pilot households. The recharge link opens a screen that already shows the pending pack.

---

## 6. Templates and the DLT filing — start this first

Nine new templates are in the config. Five need DLT registration; the WhatsApp-only ones need Meta approval.

| Template | Category | Channel |
|---|---|---|
| T-W01 welcome offer confirmed | service | WhatsApp + Push, SMS fallback |
| T-W02 free pack delivered | service | Push → WhatsApp |
| **T-W03a** cut-off prompt | **service** | WhatsApp + Push |
| **T-W03b** second pack | **promotional** | WhatsApp |
| T-W04 second pack unlocked | service | WhatsApp + Push |
| T-W05 second pack delivered | service | Push → WhatsApp |
| T-W06 still available | service | WhatsApp |
| T-W07 window closed | service | WhatsApp, SMS fallback |
| T-W08 out-of-area waitlist | service | WhatsApp, SMS fallback |

**Devanagari goes on WhatsApp, Roman on SMS, and this is a cost decision.** An SMS in Roman carries 160 characters per segment; the same text in Devanagari is Unicode and carries **70**. A Devanagari SMS therefore costs two to three times as much and is likelier to truncate. Each template carries both an `en`/`hi` Roman pair and, where it is a WhatsApp template, an `hi_devanagari` field. **Do not "fix" the SMS templates into Devanagari later.**

**Header, permanently: PYAAS-only.** One boundary that looks contradictory if you read two rules together — `config.dlt.co_branding` forbids the Parag mark in any template, script or header, while C-01 requires messages to name the delivered product, which is a Parag product. Both are right:

> **Sender identity is PYAAS-only. Product identity inside the message body names what was delivered.** `"Parag Toned Milk 500 ml — delivered by PYAAS"` is compliant. A header reading `PARAG-PYAAS` is not.

---

## 7. Guard chain — no structural change

G1 to G10 and their evaluation order are unchanged. Two additions inside existing guards:

**G6 frequency cap** gains the first-morning rule: on a customer's first delivery day, at most two messages before 12:00. Implemented as the D-01/D-02/D-06 suppression in §5.2 rather than as a counter — a counter would silently drop whichever message arrived third, and which one that is would depend on delivery timing.

**G2 consent** — W-03b is the first promotional trigger that fires inside the first 48 hours of a customer relationship. Verify that the seven-day explicit-consent TTL does not expire it before it fires. It will not at day 0, but the interaction is worth a test.

---

## 8. Display rules in the app

### 8.1 CH-13 · Traceability is gated to own-brand supply

```
if (orderLine.supplySource !== 'pyaas_own_brand') return null;
```

**Render nothing.** Not a placeholder, not "record unavailable", not a skeleton — **an empty traceability block advertises an absence.** No layout shift when absent.

Applies to: product listing tile · product detail card · subscription setup · order confirmation · delivery notification · **monthly summary**.

**Why.** The traceability record is built from PYAAS's own collection data — a named society, a collection time, a chilling time, a route, a batch. Parag milk arrives packaged from the milk union and we hold none of it; the request for access to production, the quality laboratory, packaging and dispatch is unanswered. The campaign's free pack is a **Parag** pack, so the promise would appear on the one product that cannot keep it. Same shape as an unevidenced A2 claim.

### 8.2 CH-15 · Unit price suppressed on any order carrying a free line

The USP specification already says: hide the unit price whenever the displayed price is not the price the USP was derived from. An order containing a zero-value promotional line is exactly that case — the customer pays for one pack and receives two, so no per-litre figure computed from MRP describes what they paid.

Three rows for the §5 test matrix:

| Case | Expected |
|---|---|
| Order contains a promotional line at ₹0 | USP suppressed on the order and on the basket total |
| Parag FCM 500 ml, promotional, standalone | USP suppressed — there is no price to divide |
| Parag SKU, subscriber, no promotional line | `₹72.00/L` — unchanged; Parag carries one price at every level |

### 8.3 Wallet screen — C-02, now load-bearing

Two lines, never one number: **refundable balance** and **Pyaas credit (not refundable in cash)**. The campaign introduces promotional credit at scale through the day-15 referral, so a merged figure stops being a latent defect and becomes a weekly one.

**Add a third line while an entitlement is live:** *"1 free delivery remaining."* Without it the screen shows ₹0 next to a subscription that is about to deliver, and the customer reasonably concludes something is broken.

---

## 9. CH-12 · Claims freeze as a build check

The CI check currently fails the build on `A2, Sahiwal, Holstein, single origin, pure, purest, healthier, immunity, medicinal`. Add, for as long as Parag is a supply source:

```
farm  society  collected at  traceab
फार्म  समिति  संग्रहित  ट्रेस
```

Scope: message templates · AI-call scripts · chatbot knowledge base · push copy · email · **printed marketing assets** · **monthly summary**.

**A rule in a document gets forgotten in a busy week. A failing build does not.** Lift the farm tokens only when `supply_source` is own-brand, or when the union supplies batch data in writing.

---

## 10. Admin console additions

| Capability | For | Why |
|---|---|---|
| **Offer review queue** | W-09 address/device/handle matches | Approve or reject a flagged second offer at one address, with a reason and an audit record. **Blocking — a rule with no appeal is not shippable** |
| **Manual promotional credit** | CH-09, the day-15 referral | Issue credit to the `promo_credit` account with a reason code and the issuing user recorded. The referral runs by hand during the pilot |
| **Daily reconciliation view** | W-10 | Packs issued vs consumers created, by day and by promoter, with the variance and its tolerance |
| **Offer state override** | Support | Move a customer's pack state with a mandatory reason. Delivery exceptions happen and support must be able to honour a pack without a developer |
| **Per-trigger kill switch for W** | G1 | Already required by G1; confirm the W section is covered |

---

## 11. Acceptance criteria

Each is a test, not a description.

**CH-01**

1. Campaign subscriber, ₹0 balance, pack 1 pending → `days_of_cover >= 1`; B-01, B-02, D-07 all **suppressed**, each logged with the failing guard, none silently dropped.
2. Same customer at 12:00 on day 1, no recharge → all three **fire**; skip notice gives 19 hours' notice.
3. Non-campaign subscriber, ₹0 balance → behaviour identical to revision 2. **Regression, not a new case.**

**CH-02**

4. Campaign signup, T+2h, ₹0 → A-05 **does not send**.
5. Non-campaign signup, T+2h, ₹0 → A-05 **sends**.

**CH-04 / CH-08**

6. Free-pack delivery → exactly **two** customer messages before 12:00: W-02 and W-03a. D-01, D-02, D-06 suppressed.
7. Free pack with no order line → the dispatch **fails and alerts**. It does not fall back to a generic product string.
8. Quality concern raised on a promotional pack → E-05 resolves a batch and the batch-stop path runs. **Identical to a paid pack.**

**CH-05 / CH-06**

9. Settled recharge of ₹50,000 paise → W-04 fires, `pack2_state` becomes `pending`, pack scheduled onto the next delivery.
10. Recharge **initiated but not settled** → W-04 does **not** fire. Payment later reversed → no pack released.
11. Recharge of ₹49,900 paise → W-04 does not fire.
12. Promotional consent absent → **W-03a sends, W-03b does not.** The customer can still complete the offer.
13. Day 7, no recharge → W-07 sends, contains the no-charge line, `pack2_state` becomes `expired`.
14. `packs_in_entitlement = 1` → W-04…W-07 no-op; no message references a second pack anywhere.

**CH-13 / CH-15**

15. Parag order line → **no** traceability block rendered, and no layout shift.
16. Order with a promotional line → no per-litre figure on the line or the basket total.

**CH-19**

17. Customer who took pack 1 and never paid → segments as `welcome_lapsed`, **not** `inactive`; C-02 and F-08 do not target them; they are excluded from the D30 retention denominator.

**CH-12**

18. A template containing `farm` or `फार्म` → **the build fails.**

---

## 12. Build sequence

| Sprint | Work | Blocked by |
|---|---|---|
| **0 · in parallel, day one** | **File the DLT registration for the five new templates. Submit the WhatsApp templates to Meta. Ask the aggregator, in writing, to classify the W-03 combined wording.** | **nothing** |
| **1** | CH-01 entitlement · CH-19 migrations and the offer state machine · CH-04 promotional order lines · `wallet.recharge_settled` event | nothing |
| **1** | CH-02, CH-03, CH-08 suppressions — then run acceptance tests 1–8 | CH-01 |
| **2** | CH-05 W-01…W-08 · CH-06 dual dispatch · CH-07 config · CH-11 examples | templates approved |
| **2** | CH-13 traceability gate · CH-12 CI tokens · CH-15 USP rows · wallet third line | nothing |
| **3** | W-09, W-10 · admin console: review queue, manual credit, reconciliation view, state override | CH-04 |
| **3** | CH-20 event reconciliation · campaign dashboard | events emitted |

**Sprint 0 is not a placeholder.** Template approval is where launches stall, it depends on none of the code above, and the campaign cannot go live without it.

---

## 13. What is explicitly not changing

Listed so nobody over-corrects. Each was checked against the campaign and survived.

- **The guard chain and its evaluation order.** The campaign adds triggers, not exceptions.
- **All eight corrections C-01 to C-08.** Reinforced, not weakened — C-01 becomes unavoidable once the free pack is a Parag product.
- **E-05, quality and safety: human only, 24×7, one-hour wall clock.** A pack that cost the customer nothing is not a pack that matters less. A damaged free pack is **replaced with a pack, never refunded in cash** — it had no cash value and converting it invents one.
- **The noon cut-off and the re-timed B-02.** The campaign depends on the 07:00-to-12:00 gap.
- **PYAAS-only DLT header.**
- **The de-duplication rule.** It is what stops the campaign's dense first two days becoming spam.
- **No A/B testing for 90 days.** The campaign's pilot design reaches the same conclusion independently.
- **Founding Family: extended ladder, no grace delivery.** No interaction — the campaign's free deliveries are an entitlement, not a grace.
- **All eleven AI-call guardrails**, including no call placed when no human can take a transfer.

---

## 14. Dependencies outside this build

**Website — W-19 blocks the campaign, not the CRM.** The site still says the app is *"launching soon"* while every printed asset drives to a Play Store QR. Two additions: one canonical offer-terms page at a stable URL in Hindi and English, which the app's full-terms link and the printed assets both point at; and an out-of-area path that reaches a waitlist rather than an error. The published wallet terms also still say the balance is *"fully refundable"*, which contradicts C-02 and the referral credit — **settle that before promotional credit is issued at scale.**

**Play Data Safety** is unchanged from revision 2 and now sits on the campaign's path as well as the CRM's, because every asset drives to the store listing.

**Operations, not build:** the support-hours decision. The conversion window is 07:00–12:00; published opening is 09:00 Mon–Sat, so two of those five hours are unstaffed on six days a week. No code depends on the answer — but the published hours, the app, the chatbot and the **printed** assets must all state the same thing, and a door hanger cannot be reissued.

**Still open with the milk union**, neither blocking: the pack configuration (`packs_in_entitlement`), and what constitutes a *"consumer created"* — which decides what `entitlement_reconciled` counts, and therefore whether the campaign's own stop-loss can be evaluated at all.

---

*Specification only. No application, backend, website, ERP, repository or Play Console change was made in producing this document; no message was sent to any customer; no customer data was used. The DLT categorisation in §5.1 should be confirmed in writing with the aggregator before the business relies on it.*
