# PARAG - Backend setup

How to point the app at the PARAG API, what env vars it reads, the AWS stack it
runs on, and which integrations are still stubs that need real provider keys.

Only `EXPO_PUBLIC_*` env vars belong in the app `.env` - they ship in the JS
bundle, so nothing secret goes there. All real secrets live server-side with the
API (`apps/parag-api/.env`), never in the client.

---

## 1. Point the app at parag-api

The single switch is `EXPO_PUBLIC_API_URL`.

```bash
cp .env.example .env
```

```
# .env
# Empty  -> app runs fully offline on the on-device store (demo OTP 123456).
# Set it -> app talks to a running parag-api via lib/apiClient.ts (JWT auth).
EXPO_PUBLIC_API_URL=http://192.168.1.10:4000
```

- **Local dev:** use your machine's LAN IP (not `localhost`) so the simulator or a
  physical device can reach the API. Plain `http` is fine on a LAN.
- **Deployed:** use the API's public HTTPS URL (the CloudFront / ALB endpoint from
  the Terraform outputs).
- After editing `.env`, restart Metro with `npx expo start -c` (env is read at
  startup and baked into the bundle).

When `EXPO_PUBLIC_API_URL` is set, `lib/apiClient.ts` becomes the backend seam:
the JWT **access + refresh tokens** are stored in `expo-secure-store`, the access
token rides on every request, and a `401` triggers one silent refresh against
`POST /auth/refresh` before retrying. When it is empty, `isBackendConfigured()`
is `false` and the data layer falls back to the on-device store.

## 2. The API and AWS stack

- **API:** `apps/parag-api` - NestJS + TypeORM. Phone-OTP login issues JWT
  access/refresh tokens (`POST /auth/otp/request`, `POST /auth/otp/verify`,
  `POST /auth/refresh`, `POST /auth/logout`). Every query is scoped to the
  authenticated `user_id` from the verified JWT (authorization is in the API
  layer, not the database). Schema: `apps/parag-api/schema.sql` (a reference copy
  lives at `aws/schema.sql` in this app).
- **Database:** AWS **RDS PostgreSQL 16** (`infra/aws/terraform/data-stores.tf`).
- **Assets:** **S3** for uploads (e.g. avatars under prefix `avatars/<uid>`),
  served via **CloudFront**.
- **Compute:** **ECS Fargate** behind a load balancer. Sized for 1,00,000+ users.
- **Infra as code:** `infra/aws/terraform` (network, data-stores, ECS, alarms,
  outputs).

## 3. Deferred stubs (need real provider keys)

These paths work end-to-end against the local store today, but need a real
provider wired into `parag-api` before production:

- **OTP SMS.** The demo build accepts the fixed code `123456`. Sending a real OTP
  needs an SMS provider (an India DLT-compliant gateway) configured **server-side**
  in the API's `/auth/otp/request` handler. No client change is required; the app
  already posts the phone number and verifies the returned code.
- **Payments.** Wallet recharge (`POST /wallet/recharge`) and prepaid orders
  currently credit/settle without a real charge. Wire a payment gateway
  (server-side keys + webhook) into the API before going live. `lib/walletApi.ts`
  marks the placeholder credit path.

Both stubs are isolated to the API surface - the app calls the same endpoints
either way, so turning them on does not require an app release.
