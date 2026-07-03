# Decision Log — PYAAS Native iOS

One line per decision made where the spec was silent or the environment forced a
choice.

- **Native rewrite in `PyaasNative/`.** Built a fresh native SwiftUI app rather
  than extending the Expo app, per the iOS-customer-app brief (native materials,
  transitions, haptics). The Expo app stays; both share one Supabase backend.
- **XcodeGen, not a hand-checked `.xcodeproj`.** `project.yml` is the source of
  truth; the project is generated and gitignorable. One `xcconfig` configures the
  backend. Keeps the repo reviewable and merge-friendly.
- **`SWIFT_STRICT_CONCURRENCY = targeted`** (not `complete`). Strict enough to
  catch real data races; avoids unsound `@unchecked`/`@preconcurrency` hacks
  around non-Sendable UIKit types (UIImage/CGImage) that `complete` would force.
  Reaches a genuine zero-warning build.
- **MV + `@Observable`** (one `AppModel` at the root) over TCA — lighter for an
  app this size, unidirectional, testable service layer underneath.
- **One `SupabaseClient` actor over `URLSession`** (no Supabase SDK dependency).
  Carries the public anon key + a bearer token after sign-in; never holds a
  privileged secret. RLS is the real boundary.
- **Money is integer paise** end to end via a `Money` type; formatted `en_IN`.
  No float ever touches currency. Fixture-tested.
- **Official logo as a tintable template.** `assets/pyaas-logo.png` (white-trim
  silhouette) is bundled as `pyaas-wordmark` with template rendering and tinted
  via `BrandLogo` (pink on light, white on brand/dark). Replaced the earlier
  drawn drop+leaf mark everywhere; decorative drop watermarks removed so nothing
  sits behind text.
- **Cinematic Passport open = scale+opacity zoom, not `matchedGeometryEffect`.**
  Matched geometry distorted the hero when opened from a non-featured source
  (recent scan, fresh QR scan) because the source frame is undefined. A robust
  zoom transition reads cinematic and is identical across every entry point.
- **Floating tab bar hides on navigation push.** The custom floating
  `PyaasTabBar` would otherwise overlap a pushed detail's sticky action bar
  (ProductDetail/Cart/Checkout/OrderTracking). Each tab reports its
  `NavigationPath` depth to the shell, which hides the bar when depth > 0 — the
  native "tab bar hides on push" behavior, kept with the custom bar.
- **Auth = Supabase email OTP** (`type:"email"`), per the owner's request to use
  "confirm email OTP for now." The dashboard toggle to enable it is server-side
  (documented in HANDOFF §4). Reuses the shared GoTrue — no second auth.
- **Admin = email allowlist (`ADMIN_EMAILS` xcconfig) → Owner console.** A UI
  gate only; the database must also grant those emails an admin RLS policy to
  read cross-tenant data, else the console shows an honest empty-state notice.
  Kept configurable so the owner sets both emails without a code change.
- **Only one fixture (`SampleData.passport`).** Shown as a clearly-labelled
  PREVIEW on first run so the flagship hero is never empty; any real scan or
  signed-in batch replaces it. Track shows **real** orders only (sign-in / empty
  states), never fabricated orders.
- **`PRODUCT_MODULE_NAME = PYAAS`** (matches `PRODUCT_NAME`). A mismatched module
  name broke `@testable import` host-module resolution; making them identical
  fixed the test target. `ENABLE_TESTABILITY = YES` on Debug only.
- **`StubGateway` behind a `PaymentGateway` protocol.** Real Razorpay + a
  server-verified webhook is server-side work; the protocol lets it drop in
  without touching the checkout UI. Physical goods stay on Razorpay, not IAP.
