import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

/**
 * PROMINENT DISCLOSURE CONSENT — the record that we told the member what we
 * collect BEFORE we collected it, and that they said yes.
 *
 * WHY THIS EXISTS SEPARATELY FROM components/ConsentSheet.tsx:
 * Google Play removed this app under the User Data policy — "uploading users'
 * phone number information without a prominent disclosure". That policy's
 * disclosure rule 4 is explicit: the disclosure "cannot be included with other
 * disclosures unrelated to personal and sensitive user data collection".
 * ConsentSheet bundles marketing / WhatsApp / SMS / email opt-ins alongside
 * Privacy + Terms, so putting the phone-number disclosure inside it would break
 * rule 4 and create a second violation. This module backs a DEDICATED surface
 * that talks about nothing except the data we collect to sign you in.
 *
 * Device-scoped, not user-scoped: consent has to be captured BEFORE the phone
 * number is read, which is before any account exists. linkDisclosureToAccount()
 * re-files it against the uid once we have one, so the audit trail survives.
 */

/**
 * Bump when the disclosure TEXT materially changes (new data type, new
 * recipient, new purpose). A member who accepted v1 has not consented to v2, so
 * a bump re-prompts everyone — which is the point.
 */
// Bumped 2026-08-18: the disclosure moved from a modal to the full-screen
// ConsentWelcome. Same flows, stronger presentation; everyone re-consents once
// under the new screen so every stored acceptance refers to what was shown.
export const DATA_DISCLOSURE_VERSION = '2026-08-18.2';

const ACCEPT_KEY = 'pyaas_data_disclosure_accepted';

export type DataDisclosureRecord = {
  version: string;
  app_version: string;
  accepted_at: string; // ISO
  /** Filled in once the member signs in, so consent is attributable. */
  uid?: string | null;
};

async function read(): Promise<DataDisclosureRecord | null> {
  try {
    const raw = await AsyncStorage.getItem(ACCEPT_KEY);
    return raw ? (JSON.parse(raw) as DataDisclosureRecord) : null;
  } catch {
    return null;
  }
}

/**
 * Has this device accepted the CURRENT disclosure?
 *
 * Fails CLOSED: any read error returns false, so a corrupt record re-prompts
 * rather than silently letting collection proceed on a consent we cannot prove.
 */
export async function hasAcceptedDataDisclosure(): Promise<boolean> {
  const rec = await read();
  return rec?.version === DATA_DISCLOSURE_VERSION;
}

/** Record acceptance. Called ONLY from an explicit tap on the disclosure's accept button. */
export async function recordDataDisclosureAccepted(uid?: string | null): Promise<DataDisclosureRecord> {
  const rec: DataDisclosureRecord = {
    version: DATA_DISCLOSURE_VERSION,
    app_version: Constants.expoConfig?.version ?? 'unknown',
    accepted_at: new Date().toISOString(),
    uid: uid ?? null,
  };
  try {
    await AsyncStorage.setItem(ACCEPT_KEY, JSON.stringify(rec));
  } catch {
    /* best-effort: a failed write re-prompts next launch, which is the safe direction */
  }
  return rec;
}

/** Attach the signed-in uid to an existing device-scoped acceptance. */
export async function linkDisclosureToAccount(uid: string): Promise<void> {
  const rec = await read();
  if (!rec || rec.uid) return;
  try {
    await AsyncStorage.setItem(ACCEPT_KEY, JSON.stringify({ ...rec, uid }));
  } catch {
    /* non-fatal */
  }
}

/** The audit record, for Diagnostics and for mirroring to the backend later. */
export async function getDataDisclosureRecord(): Promise<DataDisclosureRecord | null> {
  return read();
}
