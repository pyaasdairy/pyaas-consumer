import { Redirect } from 'expo-router';

/**
 * RETIRED email/password sign-up. Account creation happens through phone OTP
 * (app/(auth)/otp.tsx) behind the prominent data disclosure — the first OTP
 * verify creates the account. This route once presented an email+password
 * form that stored the password in CLEARTEXT (lib/session.ts); it now
 * redirects to the consent-gated OTP flow so no cleartext credential is ever
 * collected, even via a deep link.
 */
export default function SignUp() {
  return <Redirect href="/(auth)/otp" />;
}
