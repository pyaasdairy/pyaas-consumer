# PYAAS — Compliance Audit, Report 3

## Assessment against the nine Play policies supplied

**18 August 2026 · Read-only · Supplements Reports 1 and 2**

Nothing was modified.

**What arrived:** nine PDFs, of which five are duplicates — *User Data* twice, *Deceptive Behavior* twice, and *Permissions and APIs* in both current and Preview form. Four distinct new policies to assess: **Misrepresentation**, **Deceptive Behavior**, **Permissions and APIs that Access Sensitive Information** (plus its Preview), and **Target API Level**. *Device and Network Abuse* raises nothing against this codebase — no dynamic code loading, no root/superuser behaviour, no unauthorised network use in what I read.

This report only covers what these policies **add or change**. Reports 1 and 2 stand.

---

## 1. A correction to my own earlier work

I flagged the website's representation of Parag milk as Pyaas own-brand as the single most serious finding, and I stand by that as a **consumer-law** matter under the CPA 2019 and the CCPA Guidelines.

But it would be wrong to file it under Google Play **Misrepresentation**, and I want to correct any impression that I was heading there. Having read that policy, it governs a narrower thing than its name suggests: impersonating a person or organisation, concealing **who owns the app**, faking **country of origin**, and coordinated deception across accounts. Your developer account is honestly "PYAAS Dairy Private Limited", your country of origin is not disguised, and — this matters — **your store listing openly says "Fresh Parag milk"**.

So on Misrepresentation the app is clean. **Google does not police your website.** The Parag issue remains serious, but it is an Indian consumer-law and contractual exposure, not a Play one. Precision here is worth more to you than a longer list of alleged violations.

---

## 2. What the new policies do bite on

### 2.1 Deceptive Behavior §5 — "Behavior Transparency"

> *"Your app's functionality should be reasonably clear to users; don't include any hidden, dormant, or undocumented features within your app. Techniques to evade app reviews are not allowed."*

In Report 2 I raised `app/admin.tsx` and `app/diagnostics.tsx` as a **question**. This policy turns it into a **finding**.

Two screens exist in the consumer binary that no consumer is meant to reach. Under this clause that is a policy exposure in its own right, independent of whether they leak data — hidden or undocumented features are prohibited on their face, and a reviewer who finds an `/admin` route in a milk-delivery app will read it as review evasion until shown otherwise.

**Two separate things to check, and they are not the same thing:**

1. **Authorisation.** Does the backend enforce the role, or does the screen render on a client-side check? Anyone with the APK can read your JavaScript bundle and navigate to any route in it. A client-side `if (user.isAdmin)` is decoration.
2. **Presence.** Even fully server-gated, the screens should not ship in the consumer flavour at all. Strip them at build time, or move them to a separate internal app.

`diagnostics.tsx` deserves its own look — `apiClient.ts` calls `logDiag()`, and a diagnostics screen that surfaces those logs on-device may expose endpoints, tokens or request bodies to anyone who reaches it.

### 2.2 Deceptive Behavior §1 — "Misleading Claims" — and this one *does* reach the traceability problem

> *"We don't allow apps that contain false or misleading information or claims, including in the description, title, icon, and screenshots."*
> *"Apps must provide accurate disclosures, description and images/video of their functionality in all parts of the metadata."*

Your store listing promises QR traceability that shows *batch information, collection centre details, fat/SNF readings, and processing timestamps*.

Report 1 established that the equivalent claim on your website is illustrated with what appears to be a **sample** record — a named farm, "4.8% Fat · 9.0% SNF", specific collection and dispatch times — for milk you did not collect or test.

**Unlike the website, the store listing *is* governed by Google.** So the question becomes concrete and answerable: when a real customer scans a real pack today, does `app/trace/[code].tsx` return a real record, or a placeholder? If it returns anything mocked, seeded or hard-coded while the listing describes it as a working feature, that is a §1 exposure — and §3.1 adds that apps *"should perform as reasonably and accurately expected by the user."*

This is the one place where your website problem and your Play problem are genuinely the same problem.

### 2.3 Permissions and APIs — location, and three requirements you may be missing

Report 2 flagged location as a probable second disclosure gap. This policy sharpens it into four distinct obligations:

**a. Minimum scope.** *"Apps should request the minimum scope necessary (for example, coarse instead of fine…)"*

`app.json` declares **both** `ACCESS_FINE_LOCATION` and `ACCESS_COARSE_LOCATION`. Your stated purpose is *"to set your delivery address and show your rider on the way."* Showing the rider needs the **rider's** location, not the customer's. Setting a delivery address arguably justifies fine — but you should be able to say why coarse is insufficient, because you may be asked.

**b. The disclosure must immediately precede the request.** *"Requests for in-app user consent and runtime permission requests must be immediately preceded by an in-app disclosure."* Your `usageDescription` strings are what **Android** shows. They are not an in-app disclosure. You already have the correct pattern in `otp.tsx` — apply it to location.

**c. The app must stay usable if location is denied.** *"You must make a reasonable effort to accommodate users who do not grant access to sensitive permissions."* Can a user set a delivery address by typing it, without ever granting location? If the flow dead-ends, that is a violation as well as a conversion problem.

**d. Stop accessing when no longer needed.** *"Apps may not access data protected by location permissions after it is no longer necessary to deliver current features."*

**And coming:** the Preview document confirms that from **27 January 2027** the **location button** becomes the recommended minimum scope for precise location, and a **new Contacts Permissions policy** will require the Android Contact Picker rather than broad contacts access. Neither binds you today. Both are worth knowing before you design the next release.

### 2.4 Target API Level — your own document confirms the deadline

> *"New apps and app updates MUST target an Android API level within one year of the latest major Android version release… New apps and app updates that fail to meet this requirement will be prevented from app submission in Play Console."*

Note the mechanism: not rejected after review — **prevented from submission**. If you are below the line you cannot upload the build containing the fixes from Reports 1 and 2 at all.

With Android 16 current, that is **API 36, from 31 August 2026 — thirteen days**. Extensions are requested through Play Console. Google's own advice in this document is to start *"at least 3 months before the deadline"*, which has passed, so treat the extension as the realistic path unless your Expo 56 prebuild already lands on 36.

**This remains the single item I cannot verify from source** — there is no committed `android/` directory. Run `npx expo prebuild --platform android` and read the generated `build.gradle`. It is a five-minute check and everything else queues behind it.

---

## 3. Consolidated action list

Supersedes the priority tables in Reports 1 and 2. Website items from Report 1 §5 P2/P3 are unchanged and still stand.

### P0 — this week

| # | Action | Source |
|---|---|---|
| 1 | Verify `targetSdkVersion` ≥ 36; if not, request the extension **before 31 Aug** | Target API Level |
| 2 | Correct the Data Safety declaration — phone shared with SMS provider, payment data with processor | User Data; evidenced by `msg91SendOtp()` |
| 3 | Confirm in Console which version code is live and whether the current disclosure has ever been submitted | R2 §1 |
| 4 | Decide the Parag brand position and align the website to it | CPA 2019 / CCPA Guidelines |

### P1 — before resubmission

| # | Action | Source |
|---|---|---|
| 5 | In-app disclosure before the location permission prompt, mirroring `otp.tsx` | Permissions & APIs |
| 6 | Justify `ACCESS_FINE_LOCATION` or drop to coarse | Permissions & APIs |
| 7 | Confirm address entry works with location denied | Restricted Permissions |
| 8 | **Remove `admin.tsx` and `diagnostics.tsx` from the consumer build**; verify server-side authorisation regardless | Deceptive Behavior §5 |
| 9 | Confirm QR traceability returns real records, or amend the listing | Deceptive Behavior §1 |
| 10 | Add "and stores" to the phone disclosure text | User Data |
| 11 | Invert the root consent gate to cover signed-out users | R2 §2.2 |
| 12 | Verify in-app deletion path, Console deletion URL, and App Access OTP bypass | Account Deletion; App Access |

### P2 — 30 days

| # | Action |
|---|---|
| 13 | Central log redaction for `phone`, `otp`, `token`, `address` |
| 14 | Rotate `parag_consumer_dev_key_v1` |
| 15 | Full-history secret scan, rotate findings, **then take both repos private** |
| 16 | FSSAI licence number and logo on the website; Legal Metrology declarations on the ghee listing; GSTIN; single consistent registered address and one grievance officer name |
| 17 | Substantiation file for A2, "nothing added", traceability and testing claims |

---

## 4. Where the audit now stands

Five of six systems are done: website, Play listing, Play policy, Indian law, and both repositories.

**Google Play Console remains the only unaudited surface**, and it holds the three answers that would close this out — which build is live, the verbatim rejection detail, and the current Data Safety answers. Screenshots of **Policy status**, **Data safety** and **App content** are all I need.

My working conclusion, stated plainly so you can act on it: **the engineering for the rejection is largely done.** What is blocking you is a false Data Safety declaration, an unverified target API level, and a set of disclosure gaps in adjacent data categories — none of which require the rebuild you may have been bracing for.

---

*Read-only. No system was modified. Compliance with everything in this report does not guarantee Google Play approval — Google makes the final decision.*
