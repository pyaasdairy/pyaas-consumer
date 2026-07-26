# PARAG — production deployment checklist

One merged consumer app (`Parag-consumer/parag-app-main`) + one NestJS API (`apps/parag-api`) on AWS. The app runs local-first today (demo/offline); production = point it at the deployed API and provision the backend. Nothing here has been provisioned or submitted for you (cost + credential decisions are yours); this is the exact runway.

## 0. Decisions to lock first
- **Bundle id**: currently `in.paragdairy.app` (placeholder). Confirm the real id you own, then set it in `app.json` (ios.bundleIdentifier + android.package) before any store build.
- **Domains / support**: placeholders `hello@paragdairy.app` and `https://www.paragdairy.com`. Set the real ones (grep the app for `paragdairy.app` / `paragdairy.com`).
- **OTP SMS provider**: login OTP is a console/demo stub. Pick a DLT-registered Indian SMS provider (MSG91 / Gupshup / Kaleyra), register the sender id + template, and wire it in `apps/parag-api` auth service (`OTP_PROVIDER`).
- **Payment gateway**: wallet recharge is a placeholder. Wire Razorpay/PhonePe/UPI with your PSP keys; the app's `lib/walletApi.rechargeWallet` and the API `/wallet/recharge` are the seams. Keep `PAYMENTS_DEV_MODE=false` in prod (already the default after review).

## 1. Backend (apps/parag-api) on AWS
1. **Provision infra**: `cd infra/aws/terraform && terraform init && terraform plan` — review, then `terraform apply`. Provisions RDS Postgres 16, ElastiCache Redis, S3+CloudFront, ECR, ECS Fargate behind an ALB, SSM secrets. For 1,00,000+ users, bump `db_instance_class`, enable a read replica or Aurora Serverless v2 + RDS Proxy (connection pooling), and set `environment = "production"` (multi-AZ + deletion protection turn on automatically). A `parag-api.tf` service/target-group/listener is already stubbed to share the cluster.
2. **Apply schema**: run `apps/parag-api/schema.sql` against the RDS instance (idempotent). It creates all tables incl. the merged features (vip_memberships, referrals, leads, dairies, milk_batches, quality_tests) + rider sync.
3. **Secrets (SSM/env)**: `POSTGRES_HOST/PORT/USER/PASSWORD/DB`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (MUST be strong + set — the API now hard-fails to boot in prod if they equal the dev defaults), `S3_BUCKET`/`S3_REGION`, `OTP_PROVIDER`, payment keys.
4. **Seed catalog + dairies**: load the product catalog (from `aws/schema.sql` seed / `REAL-PRICES.md`), the member district dairy unions, and demo/real coupons.
5. **Build + push image**: build the API Docker image, push to ECR, roll the ECS service. Confirm `GET /health` 200 (entrypoint runs migrations on boot) and `GET /products`, `GET /categories` respond.

## 2. Consumer app (Expo) to the stores
1. Set `EXPO_PUBLIC_API_URL` to the deployed API base URL in the production env / EAS secrets. The app auto-switches from local-first to the live API (JWT via expo-secure-store) when this is set.
2. Swap the demo login: replace the on-device OTP (code 123456) + email registry in `lib/session.ts` for `apiClient` calls to `/auth/otp/request` + `/auth/otp/verify` (and `/auth/register` + `/auth/login`), which return JWTs. The rest of the app already routes through the data layer, so only `lib/session.ts` + `lib/auth.tsx` change.
3. Remove the demo affordances: the seeded ₹500 wallet on signup (`DEMO_WALLET_SEED` in session.ts) and the "Demo build: enter 123456" hint in `app/(auth)/otp.tsx`.
4. **Android**: `eas build -p android --profile production` for an AAB (Play Store), or the local `./gradlew assembleRelease` (JDK 17) for a sideloadable APK. Generate + secure a real upload keystore (do NOT ship the debug keystore to Play).
5. **iOS**: set your Apple Team id + ASC app id in `eas.json` submit block, `eas build -p ios --profile production`, then `eas submit`.
6. App Store / Play listings: the in-app account-deletion path exists (`profileApi.deleteMyAccount`) which both stores require; add privacy policy + terms URLs (currently `paragdairy.com/privacy|terms|refunds`).

## 3. Delivery rider sync (ready to integrate)
The consumer app + API already model the rider flow. The future rider app calls these JWT-scoped endpoints on `apps/parag-api`:
- `POST /rider/orders/:id/claim` — a rider claims an unassigned order.
- `PATCH /rider/orders/:id/status` — update status (assigned / out_for_delivery / delivered).
- `POST /rider/location` — push live GPS.
The consumer order-tracking screen (`app/order/[id].tsx`) polls its order + rider and renders the live "your rider" strip. See `apps/parag-api/README.md` (RIDER-SYNC section).

## 4. Pre-launch smoke test (against staging API)
Sign up (phone + email) -> browse full catalog (prices match `REAL-PRICES.md`) -> place an order -> track it -> claim/advance it via a rider token -> scan a demo pack (traceability) -> join PARAG Plus -> recharge wallet (test gateway) -> refer a friend. Confirm no PYAAS/pink leaks, no gradients, all tabs (Shop/Scan/VIP/Wallet/Profile) and profile links work.

## 5. Still to source (not code)
Real product photography for the 9 SKUs currently on name-tile placeholders (mattha + 8 sweets); real dairy-union coordinates/photos; real coupon set.
