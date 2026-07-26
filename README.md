# PARAG - Consumer App (iOS first)

A mobile-first consumer shopping app for **PARAG** (Pradeshik Cooperative Dairy
Federation, Uttar Pradesh; paragdairy.com). Customers browse the catalog, build a
cart, place orders and track delivery, plus milk subscriptions, coupons and a
prepaid wallet. Built with **Expo + React Native + expo-router**.

> The codebase was derived from a sibling PYAAS consumer app and re-architected
> for PARAG (new brand, new backend, reduced feature scope).

---

## 1. Run it

```bash
npm install --legacy-peer-deps      # --legacy-peer-deps avoids a harmless
                                     # Google Fonts peer-version warning
npx expo run:ios                     # build + launch a native dev client on the
                                     # iOS simulator (or a connected device)
```

Once a dev client is installed you can just start Metro on subsequent runs:

```bash
npx expo start                       # then press i for iOS, or scan the QR
npx expo start -c                    # start with a cleared cache (after env edits)
npx tsc --noEmit                     # type-check
```

`npx expo run:ios` is needed the first time because the app uses native modules
(secure-store, location, image-picker, camera).

## 2. Local-first demo login

By default the app runs **fully offline** on the device: leave `EXPO_PUBLIC_API_URL`
empty (see `.env.example`) and everything works against an on-device AsyncStorage
store with no server. Sign in with the demo phone-OTP flow:

- enter **any 10-digit phone number**
- enter the demo code **`123456`**

This creates a stable per-phone account so repeat logins return the same data.
To run against the real backend instead, set `EXPO_PUBLIC_API_URL` - see
[`BACKEND_SETUP.md`](BACKEND_SETUP.md).

## 3. Project structure

```
parag-app-main/
  app/                      expo-router screens (file-based routing)
    _layout.tsx             providers, fonts, auth gate
    index.tsx               brand splash + redirect
    (auth)/otp.tsx          phone-OTP sign-in
    (tabs)/                 Shop (index), Orders, Wallet, Profile
    product/[id].tsx        product detail + add to cart
    order/[id].tsx          live order tracking + rider connection
    payment.tsx             payment method + place order
    order-confirmed.tsx     order confirmation
    address.tsx,            add / manage delivery addresses
      addresses.tsx
    subscriptions.tsx,      milk subscriptions + vacation pauses
      vacations.tsx
    coupons.tsx,            coupons, wallet ledger, delivery prefs,
      transactions.tsx,       profile edit, search, support, legal
      delivery-preferences.tsx, profile-edit.tsx, ...
  components/               shared UI kit
  constants/products.ts     bundled product catalog (offline stand-in for the API)
  lib/                      the data layer (see DEVELOPER_NOTES.md)
    apiClient.ts            REST client for parag-api (JWT, expo-secure-store)
    localStore.ts           on-device AsyncStorage fallback
    session.ts              auth session + profile (demo OTP for now)
    api.ts, coupons.ts, subscriptions.ts, walletApi.ts,
    deliveryPrefs.ts, location.ts, profileApi.ts
  store/                    cart + wallet state (Zustand + AsyncStorage)
  assets/                   images, icons, splash
  aws/schema.sql            reference copy of the parag-api Postgres schema
  .env.example              copy to .env and set EXPO_PUBLIC_API_URL
```

## 4. Where the backend lives

- **API:** `apps/parag-api` - a NestJS + TypeORM service (JWT phone-OTP auth,
  catalog, addresses, orders, coupons, subscriptions, wallet, riders).
- **Infra:** `infra/aws/terraform` - AWS RDS PostgreSQL 16, S3 + CloudFront for
  assets, deployed on ECS Fargate.

The app talks to that API through `lib/apiClient.ts`. Until you point at it, the
local-first store carries the whole app. See `BACKEND_SETUP.md` and
`DEVELOPER_NOTES.md`.
