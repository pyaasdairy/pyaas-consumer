# PYAAS — Consumer iOS App

A native **SwiftUI (iOS 17+)** app for the PYAAS dairy brand. Scan a pack →
meet the farmers your milk came from (the **farm-to-bottle passport**), shop &
subscribe, and track delivery live. Built to a flagship bar: design-token
system, the official PYAAS logo, real loading/empty/error states, dark mode,
Dynamic Type, VoiceOver, en + hi, haptics, 60/120fps.

> New here? Read **`HANDOFF.md`** for the full context (shared backend, what's
> built, what remains) and **`DECISIONS.md`** for non-obvious calls.

---

## Requirements

- macOS with **Xcode 16+** (iOS 17 SDK or newer)
- **XcodeGen** — `brew install xcodegen`

## Build & run

```bash
cd PyaasNative
xcodegen generate                 # generates Pyaas.xcodeproj from project.yml
open Pyaas.xcodeproj               # then ⌘R on an iOS 17+ simulator
```

Headless build / test:

```bash
# build
xcodebuild -project Pyaas.xcodeproj -scheme Pyaas \
  -destination 'platform=iOS Simulator,name=iPhone 17' build

# unit tests (money / parse / cart / billing / passport / order state)
xcodebuild -project Pyaas.xcodeproj -scheme Pyaas \
  -destination 'platform=iOS Simulator,name=iPhone 17' test
```

> `Pyaas.xcodeproj` is generated — don't hand-edit it. Change `project.yml` and
> re-run `xcodegen generate`.

## Configure (one place)

Edit **`Config/Pyaas.xcconfig`** — the only file you touch to point the app at a
backend. These flow into `Info.plist` and are read by `AppConfig` at runtime:

| Key | Meaning |
|---|---|
| `SUPABASE_HOST` | Supabase project host, **no scheme** (e.g. `xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Public anon key — safe to ship, gated by RLS |
| `ADMIN_EMAILS` | Comma-separated owner emails that unlock the in-app Owner console |

Only **client-safe** values belong here. Never the `service_role` key, DB
password, or any gateway secret — this is a decompilable client.

## Sign-in (email OTP)

Login uses Supabase **email OTP**. Enable **Authentication → Email → "Confirm
email" / email OTP** in the Supabase dashboard, or the code request will return
a humane error. The two `ADMIN_EMAILS` additionally see an **Owner console**
(needs a matching admin RLS policy server-side — see `HANDOFF.md` §4).

## Project layout

```
PyaasNative/
├── project.yml            # XcodeGen project definition
├── Config/Pyaas.xcconfig  # backend + admin config (the one place to edit)
├── Resources/             # Info.plist, Assets.xcassets, en/hi.lproj
├── Sources/
│   ├── App/               # entry, AppModel, RootView, tab bar, splash, AppConfig
│   ├── DesignSystem/      # color, type, spacing, radius, shadow, motion, haptics, logo, money
│   ├── Components/        # buttons, cards, chips, skeleton, states, RemoteImage, …
│   ├── Data/              # SupabaseClient actor, models, services, Keychain
│   └── Features/          # Home, Passport, Shop, Track, Account, Admin
└── Tests/                 # XCTest unit tests
```

## Brand

Tokens live in `Sources/DesignSystem`. The mark is the official
`assets/pyaas-logo.png`, bundled as the tintable `pyaas-wordmark` template and
rendered via `BrandLogo` (pink on light, white on dark/brand). PYAAS pink
`#F36CB5`; gold is reserved for VIP. Use the tokens — no literal colors/fonts in
views.

## TestFlight

Set a real signing team in Xcode (or `DEVELOPMENT_TEAM` in `project.yml`),
archive the `Pyaas` scheme, and upload. Drop in the final 1024² app icon
(`Assets.xcassets/AppIcon`) first.
