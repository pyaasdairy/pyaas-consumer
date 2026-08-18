import { Redirect } from 'expo-router';

/**
 * RETIRED email/password sign-in. The only supported auth is phone OTP
 * (app/(auth)/otp.tsx), which is gated by the prominent data disclosure. This
 * route once presented an email+password form that stored the password in
 * CLEARTEXT (lib/session.ts) and, being deep-linkable via the pyaas:// and
 * parag:// schemes, was reachable with no disclosure — a data-safety liability.
 * It now redirects to the consent-gated OTP flow so the collection surface no
 * longer exists.
 */
export default function SignIn() {
  return <Redirect href="/(auth)/otp" />;
}
