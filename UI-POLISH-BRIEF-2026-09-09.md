# UI polish pass — "small things, big difference" (9 Sep 2026)

## The brief (the prompt this pass was executed against)

> You are polishing PYAAS, a milk-subscription and dairy commerce app for Indian
> households, to the interaction standard of Blinkit, Zepto, Swiggy Instamart and
> Country Delight. Change no logic, no data flow, no copy, no navigation. Add only
> the "small things that feel expensive": shimmer skeletons instead of flat grey;
> images that fade in over a placeholder instead of popping; a tap that visibly
> presses (scale + spring); add-to-cart that answers with a count pop, a haptic and
> a quiet toast; a cart bar whose number bounces when it changes; a tab bar whose
> active icon springs; a product hero that parallaxes as you scroll; a sliding
> highlight under the active category; a success moment that celebrates once and
> gets out of the way; brand-coloured pull-to-refresh. Every motion uses one spring
> vocabulary, respects Reduce Motion, is under 400 ms, and never blocks a tap. If a
> change could alter behaviour, don't make it.

## Already there before this pass (kept, not duplicated)

Tap press-spring + haptics · shimmer skeletons · tab-bar sliding highlight + icon
spring + selection haptic · branded pull-to-refresh · wallet count-up, particles,
shine · list entrance stagger · order-confirmed celebration.

## Added (all presentation-only; zero handler/data/copy changes)

| Where | What |
|---|---|
| `lib/motion.ts` | Every spring preset and entrance preset now honours **Reduce Motion** (`ReduceMotion.System`); new `spring.pop` for count changes |
| `components/Pop.tsx` (new) | `PopOnChange` — 1 → 1.22 → 1 spring the moment a value changes; skips mount |
| `components/Toast.tsx` (new) + root layout | App-wide quiet toast: one at a time, above the tab bar, auto-dismiss, optional action. `showToast(text, { icon, action })` |
| Product card | Toast on add ("Added · <name>" with **View cart**) and on favourite; bag badge count pops |
| `ui.tsx` Stepper | Quantity pops on every change — cart, product page, everywhere a stepper exists |
| Home cart bar | Item count pops when it changes |
| Home category rail | ONE highlight that **slides** between chips (spring), selection haptic |
| Product page | Hero **parallax** (drifts at ~40 % of scroll, stretches on over-scroll); toast on add |
| Recharge success | Checkmark springs in, particles celebrate once |
| Welcome Litre sheet | Grab handle |
| 25 `expo-image` usages | `transition={220}` fade-in instead of pop-in |

## Verification

`tsc` clean · iOS release build (Hermes bytecode 96) · Android release APK boots on
the emulator · simulator boot clean.

## Deliberately NOT done (would risk behaviour)

Gesture-to-dismiss sheets (touch-handling change) · Android ripple (square ripple
bleed on pill buttons without clipping changes) · animated list reordering.

## Round 2 (tester feedback, same day)

| Ask | Done |
|---|---|
| Custom recharge amount opens at ₹250 | `recharge.tsx`: custom field pre-filled with 250 unless the caller pinned an amount or the required minimum is higher |
| Keyboard must never cover an input (APK + iOS) | Root cause on Android: edge-to-edge (SDK 56) disables the `adjustResize` window shrink the OTP screen relied on — verified on the emulator (field fully covered). Fix: `components/KeyboardSafe.tsx` (Android `KeyboardAvoidingView`, iOS passthrough — iOS keeps `automaticallyAdjustKeyboardInsets`), wrapped around every scrolling input screen; OTP keyboard spacer now runs on Android too; every iOS-only `behavior` prop made cross-platform (6 sites) |
| "Added" toast overlapped the cart bar / nav bar | Bottom-chrome registry in `Toast.tsx`: tab bar, home mode bar, floating cart bar and each screen's sticky CTA register how far up they reach; the toast floats 12px above the tallest visible one. Symmetric 14/14 padding |
| Text symmetry ("justice") | Justified paragraphs on the offer terms, popup lines, offer-terms intro, message-preferences intro, consent disclosure copy, recharge footnote + disclosures |
| Em dash in the unserviceable-area text | It lived in the BACKEND: `crm_offers.go` NOT_SERVICEABLE message and the "delivered by PYAAS" order-line suffix — both rewritten in `parag-saathi-be` (uncommitted there; needs the backend deploy to reach users). App-side string scan: zero dashes |

Versions: 1.0.2 · iOS build 13 · Android vc38. 1.0.1 was approved and is live.

## Round 4 · UI audit (2026-09-12)

Static scan of every screen plus an emulator walk (320dp, the harshest width;
real phones are 360dp and up) and a simulator boot. No logic touched.

### Findings and fixes

| Area | Caveat | Fix |
| --- | --- | --- |
| Status colours | Raw hex greens/reds/ambers scattered across cart, orders, product, profile, order detail | Semantic tokens `colors.live / liveSoft / warn / dangerDeep / veg / nonVeg` in `lib/theme.ts`; every raw use replaced |
| Tap targets | Several close and icon-only buttons were 28 to 32px with no label | `Tap` gets a default `hitSlop` of 8; close buttons are 40x40 with `accessibilityLabel="Close"`; icon-only buttons labelled |
| Headers | Three screens had hand-rolled back rows at a different size | All use `BackButton` with a 24pt Serif title; Message preferences title now shrinks instead of clipping |
| Empty states | Trailing periods on one-line empty states; subscriptions empty state still pitched the retired 2+2 | Periods removed; subscriptions empty state is neutral copy |
| Tab bar | Tabs exposed no accessibility node | Each tab is `accessible` with its label |
| Profile | Masked phone wrapped onto two lines; tile labels ellipsized on narrow phones | Phone is single-line; tile labels shrink to fit |
| Wallet | "PYAAS Wallet" pushed the Statement link off the edge on narrow phones | Title shrinks and yields; Statement link keeps its width and is labelled |
| Plus | Docked join bar's sub-line wrapped to three lines; toasts could cover the bar | Sub-line is single-line and shrinks; bar registered as bottom chrome |
| Home header | Wordmark crushed "Deliver to <city>" on sub-360dp displays | Wordmark is 82 wide under 360dp, 96 otherwise |
| Stepper | Quantity changed with no motion | `PopOnChange` scale pulse on every change |
| Toasts | Overlapped the cart bar and tab bar | Bottom-chrome registry; toasts sit above the tallest registered bar |
| Product page | Parallax hero drifted down over the title, badges and pager dots on scroll | Hero is clipped inside its own box, so the pack shot drifts in place and the sheet always covers it |
| Product card | Heart and bag buttons had no accessibility label | Labelled, with selected state on the heart |
| Bottom bar | Calendar mini-button had no accessibility label | Labelled "My subscriptions" |
| OTP | A failed verification only turned the code boxes red; the message existed on the phone step only | Error text now renders under the boxes (live region) |
| Home header (Android) | Frosted blur silently fell back to none (method needs a blur target) and used a deprecated prop | iOS keeps real blur; Android gets a near-solid wash, no deprecated prop |
| Plus (compact) | Join button clipped the price row under 360dp | Short "Join" label under 360dp; full label on every real phone |

### Verified
- `tsc --noEmit` clean.
- iOS and Android release bundles built after the last patch; Hermes bytecode 96 confirmed on both.
- Emulator (320dp, harshest width) walked on the final APK: sign-in, home, wallet, profile, Plus, product page, search.

### Shipped as 1.0.3 (iOS build 14), 2026-09-12
- Version 1.0.3 created in App Store Connect with release notes and phased release.
- Screenshots replaced with the five designed shots from `iPhone 14 Pro screenshots/`, resized to 1290x2796 (6.9") and 1284x2778 (6.5") in `store-screenshots/`, uploaded via the API to both display sets.
- Android APK with the same code is on the Desktop (`pyaas-apks/PYAAS-TEST-0912-1248-1f075f0-ui-audit.apk`); Play upload still needs `eas login`.
