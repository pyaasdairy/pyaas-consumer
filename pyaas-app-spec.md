# PYAAS app: build spec after the ERP and website sync

- **App:** PYAAS: Know Your Milk (Android `in.pyaasdairy.app`; iOS App Store id6802787510).
- **Screens mock:** `pyaas-app-screens.html`, 10 screens.
- **Related files:**
  - `pyaas-post-sync-erp-website.md`: the ERP and website findings.
  - `pyaas-one-voice-guide.html`: the words to use.
- **Checked against:** the live ERP (erp.pyaasdairy.com) on 19 September 2026.

**Rule one:** the app never types a price or a status. It reads prices, stock, member status and farm status from the ERP through the backend proxy.

---

## 1. What changes, in plain words

1. **Name:** "PYAAS Plus" becomes **Founding Family** everywhere in the app.
2. **Pick a farm first:** every home picks one of the 4 farms before paying ₹99.
3. **Parag is open to everyone:**
   - Door delivered at MRP.
   - **No member discount on Parag, ever.** Today's screen shows 10% off Parag (₹30 → ₹27, ₹71 → ₹64). With Parag earning about ₹4.70 a litre, that loses money on every pack.
4. **PYAAS milk is members only:** Whole Farm Milk and the Traced Pool range open only when the home's farm has unlocked. The member price is ₹2 off per litre.
5. **Perks removed:** "Priority slots" and "One flat month, never auto-renews" go. The new line is "₹99 a month, starts only when your farm opens · stop any month".
6. **Parag offer:** the 1 Litre Free Parag Milk offer runs inside Shop, Product and Wallet for new customers.

---

## 2. Screens (see the HTML mock)

| # | Screen | Who sees it | Main button | Reads from ERP |
|---|---|---|---|---|
| 1 | Shop | Everyone | Subscribe (Parag) · 🔓 Unlock with Founding Family (PYAAS milk) · Add to cart (ghee) | Products, level 1 price, stock, customer's offer eligibility |
| 2 | Parag product | Everyone | Subscribe | PRG-FCM-500ML ₹36 / PRG-FCM-1LTR ₹71 · offer step 1 eligibility |
| 3 | Wallet | Everyone | Add money | Wallet balance (customer advance) · offer step 2 status and days left |
| 4 | Founding Family (replaces the Plus screen) | Non-members | Pick your farm | FOUNDING-99 price · level 1 vs level 3 for the savings line · DELIVERY-FEE |
| 5 | Pick your farm | Non-members | Claim [farm] (only on Filling farms) | Farm records: name, farmer, photo, unlocks at, claimed, status |
| 6 | Join, pay ₹99 | Non-members | Pay ₹99 · hold my seat | FOUNDING-99, wallet balance |
| 7 | You're in | Members | Share on WhatsApp | Member: farm, line number, referral code, homes to go |
| 8 | PYAAS product | Everyone (state changes) | Non-member: 🔓 Unlock with Founding Family · waiting member: "✓ Alert on at unlock" · unlocked member: Subscribe | Level 1 and level 3 prices · member farm status |
| 9 | Basket / checkout | Everyone | Place order | Order at level 3 (PYAAS lines, members) or level 1 · DELIVERY-FEE rule |
| 10 | Notifications | Everyone | n/a | Events in §6 |

**Bottom bar stays as it is today:** Shop · Scan · PYAAS (centre) · Wallet · Me. The centre button opens Founding Family:

- **Non-member:** screen 4.
- **Member:** screen 7.

---

## 3. States the app must handle

### 3.1 Customer states

| State | How the app knows (ERP) | Shop shows PYAAS milk as | Centre button opens |
|---|---|---|---|
| Guest / not signed in | no customer | ₹85 · members ₹83 · 🔓 Unlock with Founding Family | Founding Family (4) |
| Customer, not member | customer, no Founding Family record | same as above | Founding Family (4) |
| Member, farm Filling | member status **Waiting**, farm status Filling | ₹85 · you pay ₹83 · 🔒 Opens when [farm] unlocks | You're in (7) |
| Member, farm Unlocked | member status **Active**, farm status Unlocked | ₹85 · you pay ₹83 · Subscribe | You're in (7), with "Your farm is delivering" |
| Member, stopped | member status **Stopped** | back to non-member view | Founding Family (4), "Re-join" |

### 3.2 Farm states

| Farm status | Pick-your-farm card shows | Claim button |
|---|---|---|
| **Filling** | "N more homes to unlock" + progress bar + "🔒 At [unlocks at] homes, these packs unlock" with pack photos | Yes |
| **Unlocked** | "✓ Unlocked these packs for its Founding Family" + pack photos + "Claims closed" | **No.** No seat count either. |

### 3.3 Planned farm numbers

These are set in the ERP, not in the app.

| Farm | Farmer | Unlocks (and closes) at |
|---|---|---|
| Sri Radha Mohan Dairy (Founder's family farm) | Ram | 150 homes |
| Mishra Dairy | Abhishek Mishra | 80 homes |
| Gonard Dairy | Harsh Singh | 65 homes |
| Ranjeet Singh Dairy (Dutt Nagar) | Ranjeet Singh | 55 homes |

---

## 4. Prices shown in the app (live ERP, 19 Sep 2026)

| Pack | Level 1 (MRP) | Level 3 (Founding Family) | Status |
|---|---|---|---|
| Whole Farm Milk 1 L bottle / 1 L pouch | ₹85 | ₹83 | **SKU missing in ERP: create first** |
| Toned 1 L · 500 ml · 450 ml | ₹85 · ₹51 · ₹48 | ₹83 · ₹50 · ₹47 | In ERP (PYS-TONED-*) |
| Premium Cow Milk 1 L · 500 ml · 450 ml | ₹139 · ₹79 · ₹65 | ₹137 · ₹78 · ₹64 | In ERP as PYS-A2-* (rename customer-facing name to "Premium Cow Milk") |
| A2 Milk 1 L bottle / pouch | (website ₹85 / ₹80) | ₹83 / ₹78 | **Missing in ERP.** Hide in app until created. |
| Trial packs 200 ml | ₹20 · ₹30 | same | no discount |
| Pure Cow Ghee, Bilona 500 ml | ₹1,499 | same | open to all |
| Parag Taza 500 ml · 1 L · 5 L | ₹30 · ₹59 · ₹300 | **same (MRP)** | open to all |
| Parag Gold 500 ml · 1 L | ₹36 · ₹71 | **same (MRP)** | open to all |

**Price level 2 in the ERP today:** ₹75 on Toned 1 L, ₹125 on Premium 1 L. That is ₹10 to ₹14 off, and it looks like the old Plus price.

- The app must stop reading level 2 for members.
- Use **level 3**.

**Display rule:** "₹85 · you pay ₹83" for members, "₹85 · members ₹83" for everyone else. Never strike through a Parag price.

---

## 5. Rules the backend must enforce (not just the screen)

1. **PYAAS milk order allowed** only if the customer is a Founding Family member **and** their farm status is Unlocked. Otherwise reject with "Opens when [farm] unlocks".
2. **Price level:**
   - Active members get level 3 on PYS-* lines.
   - Everyone else gets level 1.
   - Parag (PRG-*) is always level 1.
3. **Delivery fee:**
   - Add DELIVERY-FEE ₹5 per delivery only when the order has PYAAS milk and the customer is not an Active member.
   - Never on Parag-only orders ("door delivered at MRP").
   - Needs your yes first.
4. **Whole Farm Milk lines** carry the customer's claimed farm. Stock comes from that farm only.
5. **Farm claim:**
   - Rejected if the farm is Unlocked.
   - When claims reach "unlocks at", set the farm to Unlocked, close claims, set its members to Active, and send the unlock notification.
6. **₹99 billing:**
   - **Join:** ₹99 is taken from the wallet and booked as a customer advance against FOUNDING-99. Status is Waiting.
   - **Unlock:** that ₹99 becomes month 1, starting on the first delivery.
   - **After that:** ₹99 is taken from the wallet every month on the same date.
   - **Reminder:** sent 3 days before each charge.
   - **Stop:** any month, from Me › Founding Family. Perks end at the end of the paid month.
   - **Low wallet:** if the wallet is short on billing day, retry for 3 days, then set Stopped. No debt, no lock-in.
7. **Refund:** a Waiting member whose farm has not unlocked within 60 days of launch gets ₹99 back to the wallet (or to source, if asked).
8. **Referral:**
   - It counts only when the referred friend pays ₹99.
   - The referrer moves up the line; there is no cash or credit.
   - Place in line is shown only after OTP login.
9. **Parag offer, step 1:**
   - First order by a new customer: one PRG-FCM-500ML line at ₹0 (MRP ₹36), reason "1 L free offer · step 1".
   - Order before 12 noon for delivery by 7 AM.
10. **Parag offer, step 2:**
    - First wallet top-up of ₹500 or more within 7 days of the first delivery adds a second ₹0 PRG-FCM-500ML line to the next delivery.
11. **Offer limits:**
    - New customers only; one per mobile number and per address.
    - Select Lucknow areas (the serviceable pin codes); Android only.
    - Subscription needed.
    - MRP never changes.

---

## 6. Notifications

| Trigger | Text |
|---|---|
| Farm unlocks | Gonard Dairy is unlocked! 🎉 Whole Farm Milk from Harsh Singh and the full PYAAS range are open for you. First delivery tomorrow by 7 AM. |
| Referred friend pays ₹99 | Your friend Neha joined. You moved up to #271. She claimed Gonard Dairy: 2 more to unlock. |
| 5 or fewer homes to unlock | 2 more homes to unlock Gonard. Share your link with your society group. |
| Offer step 1 order placed | Your free 500 ml Parag Gold is on the way. At your door by 7 AM. Add ₹500 to your wallet in the next 6 days for another 500 ml free. |
| Offer step 2, 2 days left | 2 days left: add ₹500 to your PYAAS Wallet and get another 500 ml Parag Gold free. |
| 3 days before ₹99 | ₹99 Founding Family on 1 Nov, from your PYAAS Wallet. It keeps free delivery and ₹2 off every litre. Stop any time in Me › Founding Family. |
| Wallet short on billing day | Add ₹[x] to keep free delivery and ₹2 off every litre. We'll try again tomorrow. |

**Never send:** "Hurry, almost sold out", cash or reward language, "priority slot", or anything about Farmer Meter or daily testing results before launch.

---

## 7. Words (from the One Voice Guide)

| Use | Don't use |
|---|---|
| Founding Family · Join the Founding Family · Claim your farm | PYAAS Plus, Plus member, VIP, membership card |
| 🔓 Unlock with Founding Family (PYAAS milk button for non-members) | Notify me, Buy now (before membership) |
| ₹99 a month, starts when your farm opens · stop any month | One flat month, never auto-renews, cancel anytime no lock-in (replace) |
| Free delivery, every morning · ₹2 off every litre | 10% off every milk, member price on Parag, priority slots |
| 1 Litre Free Parag Milk* · Parag Cooperative Milk offer | 1 litre free milk (with a PYAAS carton image) |
| Door delivered at MRP (Parag) | Parag discount |
| Refer a friend, move up the line | Earn rewards, win cash |

---

## 8. Moving today's Plus members

1. List everyone who paid ₹99 for Plus or Founding Family (the website says about 289).
2. In-app message: "PYAAS Plus is now the Founding Family. Pick your farm to keep your place in line. Prefer a refund? Tap here and your ₹99 goes back."
3. If they pick a farm, they get status Waiting and keep their original join date as their line position.
4. If they ask for a refund, it goes back to source. You've already decided to return the money collected so far, so offer the refund to everyone who doesn't pick a farm within 14 days.
5. Turn off the old Plus pricing (level 2) for all of them on the same day.

---

## 9. ERP items the app depends on (build these first)

| Item | ERP | Status today |
|---|---|---|
| Whole Farm Milk 1 L bottle, 1 L pouch | Products, level 1 ₹85, level 3 ₹83, extrafield Farm | Missing |
| Price level 3 "Founding Family" | Level 1 minus ₹2/L on PYS-* milk | Levels 3–5 = level 1 today |
| FOUNDING-99 | Service, ₹99, monthly | Missing |
| DELIVERY-FEE | Service, ₹5 | Missing (needs your yes) |
| Founding Family member record | Member type or customer tag + extrafields: farm, line no., referral code, referred by, status, joined, unlocked on, next bill date | Missing |
| Farm records | Name, farmer, photo URL, unlocks at, claimed count, status | Missing |
| Offer tracking | Customer extrafields: offer step 1 date, step 2 date, eligible Y/N | Missing |
| Customer-facing names | "Toned Milk …", "Premium Cow Milk …" | Toned blank; Premium says "Pyaas Cow Milk" |
| Stray Parag records | `Full_Cream_Milk_FCM`, `Parag_Gold` | Remove so the app never lists them |

---

## 10. Test before release

- [ ] **New customer:**
  - [ ] Sees the offer banner.
  - [ ] First Parag Gold 500 ml order costs ₹0.
  - [ ] ₹500 top-up within 7 days adds a second ₹0 pack.
  - [ ] A second account on the same mobile or address gets nothing.
- [ ] **Existing customer:** does not see the offer banner.
- [ ] **Parag prices:** always MRP for members and non-members.
- [ ] **Non-member:**
  - [ ] Sees PYAAS milk with "🔓 Unlock with Founding Family".
  - [ ] Cannot add it to the basket.
- [ ] **Waiting member:**
  - [ ] Sees "you pay ₹83".
  - [ ] Order is blocked with "Opens when Gonard unlocks".
- [ ] **Unlocking:**
  - [ ] The unlock push arrives.
  - [ ] Members turn Active.
  - [ ] The farm shows "Claims closed" and no Claim button.
- [ ] **Active member basket:**
  - [ ] PYAAS lines at level 3.
  - [ ] Parag at level 1.
  - [ ] Delivery free.
- [ ] **Non-member with PYAAS milk:** DELIVERY-FEE ₹5 added, if approved.
- [ ] **₹99 billing:**
  - [ ] Reminder 3 days before.
  - [ ] Charge from wallet.
  - [ ] Retry for 3 days, then Stopped.
  - [ ] Stop works from Me › Founding Family.
- [ ] **Referral:** counts only after the friend pays; place in line is hidden until OTP login.
- [ ] **Text sweep:** no "Plus", "VIP", "priority slot", "10% off" or "Notify me" left anywhere in the app.
- [ ] **Hidden SKUs:** A2 bottle and pouch stay hidden until they exist in the ERP.

---

## 11. Decisions still open

1. ₹5 delivery fee for non-members on PYAAS milk: yes or no?
2. Monthly ₹99 from the wallet automatically (proposed here), or a manual "Renew" each month?
3. Whole Farm Milk at ₹85: final? It is cheaper than Premium Cow Milk at ₹139.
4. Who is on ERP price level 2 today?
5. GST 18% on the ₹99: confirm with your CA.
6. iOS: the wallet and member pricing may raise App Store review questions. Keep the ₹99 as a service paid through the wallet and check Apple's rules before the iOS launch.
