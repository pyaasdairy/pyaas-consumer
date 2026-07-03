# Supabase Edge Functions - deploy & secrets

## A. Set the secrets (two ways)

### Option 1 - Dashboard (no CLI, easiest)
Supabase Dashboard → your project → **Edge Functions** → **Secrets** →
**Add new secret**, one per row:

| Name | Value |
|---|---|
| `MSG91_AUTH_KEY` | `524888…P1` |
| `MSG91_OTP_TEMPLATE_ID` | `6a2903a27e0715c5a50a92c3` |
| `MSG91_SENDER_ID` | `PYAASD` |

### Option 2 - CLI
```bash
supabase login                                   # opens browser
supabase link --project-ref mpzvykwayknrohzihakq # this project
# either set them one by one:
supabase secrets set MSG91_AUTH_KEY=524888TuaRkyMJjJ6a290283P1
supabase secrets set MSG91_OTP_TEMPLATE_ID=6a2903a27e0715c5a50a92c3
supabase secrets set MSG91_SENDER_ID=PYAASD
# …or all at once from the template you filled:
supabase secrets set --env-file supabase/functions.env
```

## B. Deploy the function
```bash
supabase functions deploy send-sms --no-verify-jwt
```
URL becomes: `https://mpzvykwayknrohzihakq.functions.supabase.co/send-sms`

## C. Wire it as the SMS hook + enable phone
1. **Auth → Providers → Phone → Enable** (no Twilio needed; we use the hook).
2. **Auth → Hooks → Send SMS Hook → Enable** → choose the `send-sms` function
   (or paste its URL). Copy the generated **hook secret** if you want to verify
   signatures (optional hardening).
3. (Already done) **Confirm email OFF** under Email provider.

## D. Prerequisite: DLT
MSG91 needs your **Sender ID (`PYAASD`)** and the **OTP template** DLT-approved.
The template must contain a variable for the code; make sure its variable name
matches the one in `send-sms/index.ts` (`otp` / `OTP` / `var1`).

## E. Test
In the app, the OTP screen → enter your mobile → **Send code**. If it doesn't
arrive, check **Edge Functions → send-sms → Logs** and the MSG91 dashboard
delivery report.

---
The `notify-status` function (order/pickup SMS) follows the same pattern: a
Database Webhook on `orders` (status change) → calls MSG91 flow with
`MSG91_TXN_TEMPLATE_ID`.
