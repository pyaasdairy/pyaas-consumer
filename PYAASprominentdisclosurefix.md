# PYAAS: Know Your Milk — Fixing the "APK Requires Prominent Disclosure" Rejection

**App:** in.pyaasdairy.app · **Flagged version code:** 1 · **Policy:** User Data (Personal & Sensitive Data)
**Prepared:** 19 August 2026

---

## 0. Read this first: two separate problems

Your Play Console notifications show **two** enforcement events, not one:

| Date | Event | Meaning |
|---|---|---|
| 16 Aug 2026 | **App removed** | The app is off Google Play. New users can't install it; existing users get no updates. |
| 19 Aug 2026 | **App update rejected** | Your latest submission was refused for the prominent-disclosure issue. |

Fixing the disclosure addresses the rejection. **Check the 16 Aug "App removed" notice separately** (Play Console → *Policy* → *App content* / *Policy status*) — a removal may need its own remediation or appeal, and a fixed update will not automatically reinstate a removed app.

---

## 1. Why updating the Data safety form did not fix it

The Data safety section is a **declaration to Google**. The rejection is about **what the app does on screen**. Google states this explicitly:

- The disclosure "cannot only be placed in a privacy policy or terms of service"
- Don't substitute the disclosure for your privacy policy **or the Data safety section**

Keep the Data safety form accurate — it's necessary — but it is not sufficient. You need a screen inside the app.

---

## 2. What actually triggered this

You collect the phone number two ways:

1. **User types it into the OTP login screen.** This is generally *within reasonable user expectation* and on its own does not require prominent disclosure.
2. **The app auto-reads the number from the device.** ← **This is almost certainly the violation.** Silent reading of the SIM/device number is outside what a user expects.

### Ask your RN team to grep for these

Check `android/app/src/main/AndroidManifest.xml` **and the merged manifest** (`android/app/build/outputs/logs/manifest-merger-release-report.txt`) — libraries inject permissions you never declared:

```
android.permission.READ_PHONE_STATE
android.permission.READ_PHONE_NUMBERS
android.permission.READ_SMS
android.permission.GET_ACCOUNTS
```

Common React Native culprits:

- `react-native-device-info` → `getPhoneNumber()`
- `react-native-otp-verify` / SMS Retriever wrappers
- `react-native-sim-data`, `react-native-sim-cards-manager`
- Truecaller / carrier-verification SDKs
- Any analytics or attribution SDK that fingerprints the subscriber

---

## 3. Two paths to compliance — pick one

### ✅ Path A — Remove the auto-read (recommended, fastest approval)

Delete the phone-number permissions and replace auto-read with Google's **Phone Number Hint API** (`com.google.android.gms:play-services-auth`). It shows a **system-provided** picker where the user taps their own number.

- No `READ_PHONE_STATE` / `READ_PHONE_NUMBERS` permission required
- No prominent disclosure required — the user selects the number themselves
- Same UX benefit (number pre-filled), zero policy exposure

To strip a permission injected by a library, add to your app manifest:

```xml
<uses-permission android:name="android.permission.READ_PHONE_STATE"
    tools:node="remove" />
<uses-permission android:name="android.permission.READ_PHONE_NUMBERS"
    tools:node="remove" />
```

(with `xmlns:tools="http://schemas.android.com/tools"` on the `<manifest>` tag)

**If you take Path A, skip to Section 6.**

### Path B — Keep the auto-read, add a prominent disclosure

Use the copy in Section 4 and the UI rules in Section 5.

---

## 4. Prominent disclosure copy (ready to use)

Google's recommended format is:
> "[This app] collects/transmits/syncs/stores [type of data] to enable ['feature'], [in what scenario]."

### 4a. Primary version — full screen or modal, shown before any number is read or sent

> **Before you sign in**
>
> PYAAS collects and transmits your phone number to PYAAS servers to create and secure your account, send you a one-time password (OTP) to verify it, and link your milk subscription, deliveries and order history to you.
>
> To save you typing, PYAAS also reads the phone number stored on this device to fill in the sign-in field. You can decline this and enter your number manually instead.
>
> We do not sell your phone number or share it for advertising.
>
> `[ Agree and continue ]`  `[ Not now ]`

### 4b. Short version — if the auto-read is the only thing you're disclosing

> **Read your number from this device?**
>
> PYAAS reads the phone number stored on this device to fill in the sign-in field for you, so you don't have to type it. Your phone number is transmitted to PYAAS servers to create your account and verify it by OTP.
>
> `[ Agree ]`  `[ Enter it myself ]`

### 4c. Hindi (for a bilingual audience)

> **साइन इन करने से पहले**
>
> PYAAS आपका फ़ोन नंबर एकत्र करता है और PYAAS सर्वर पर भेजता है, ताकि आपका खाता बनाया और सत्यापित (OTP) किया जा सके और आपकी दूध सदस्यता, डिलीवरी और ऑर्डर हिस्ट्री आपसे जुड़ी रहे।
>
> टाइपिंग बचाने के लिए PYAAS इस डिवाइस में सहेजा गया फ़ोन नंबर भी पढ़ता है। आप इसे अस्वीकार करके नंबर स्वयं दर्ज कर सकते हैं।
>
> हम आपका फ़ोन नंबर बेचते नहीं हैं और विज्ञापन के लिए साझा नहीं करते।
>
> `[ सहमत हूँ ]`  `[ अभी नहीं ]`

---

## 5. UI rules the reviewer will check

**Placement & timing**

- [ ] Inside the app, in the normal flow — **not** behind a menu, Settings, or a "Learn more" link
- [ ] Shown **before** the number is read, collected, or uploaded — and before the runtime permission dialog
- [ ] Not only in the privacy policy, terms, or store listing

**Consent mechanics**

- [ ] Affirmative action required: an explicit tap on **Agree** (or an unticked checkbox the user ticks)
- [ ] **Two visible options** — one to accept, one to decline ("Not now" / "Enter it myself")
- [ ] Back button, home button, or tapping outside must **not** count as consent
- [ ] No auto-dismiss, no countdown, no expiring toast/snackbar
- [ ] Not pre-checked, not opt-out

**Content**

- [ ] Says **what** data (phone number), **why** (account creation, OTP verification, linking orders), and **how it's used/shared**
- [ ] Written plainly — Google's bar is "understandable to a 13-year-old"
- [ ] **Not bundled** with unrelated disclosures — do not combine this with T&C / privacy-policy acceptance, marketing opt-in, or a location prompt in the same dialog
- [ ] Styled like your app, not like an Android system notification
- [ ] Button says "Agree", not "Allow access" or "Got it"

**Graceful degradation**

- [ ] Declining must not break the app — the user should still be able to type their number manually and sign in

---

## 6. Resubmission steps in Play Console

1. **Ship the fix.** Increment `versionCode` (must be **> 1**, since version code 1 was flagged) and build a new signed AAB.
2. **Verify Data safety matches reality.** *App content → Data safety*: Phone number declared as **collected**, purposes = *App functionality* and *Account management*, encrypted in transit, users can request deletion. If you took Path A and no longer auto-read, make sure the form reflects that.
3. **Confirm your privacy policy** at the URL in your listing actually describes phone-number collection, use, retention and sharing.
4. **Upload the release.** *Test and release → Production* (or your track) → **Create new release** → upload the AAB → add release notes.
5. **Send for review.** *Publishing overview* → **Send changes for review**. Do not skip this — a saved release sits unsubmitted otherwise.
6. **Handle the 16 Aug removal.** Open that notice's *View details* and follow its own remediation/appeal path. A new release alone may not reinstate a removed app.
7. **Keep evidence.** Record a 20–30 second screen capture of the disclosure appearing before any data is read, with both buttons visible. Attach it if a reviewer or appeal asks for proof.

**Timing:** reviews after a policy violation commonly take longer than a normal update; appeals are quoted at up to 7 days and sometimes longer. Your previously published version stays live in the meantime *unless* the app is under removal.

---

## 7. When to appeal instead

Only appeal if you can show the app never reads or uploads the phone number without disclosure — e.g. the flagged behaviour comes from a third-party SDK you have already removed. Appealing without a code change generally fails; shipping the fix is faster.

---

## Sources

- Google Play — Best practices for prominent disclosure and consent: https://support.google.com/googleplay/android-developer/answer/11150561
- Google Play — User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
