import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDiscLang, type DiscLang } from './i18n';
import { queueConsentMirror } from './consentSync';

/**
 * LOCATION PROMINENT DISCLOSURE — Play's Permissions & APIs policy requires
 * that a runtime permission request be IMMEDIATELY PRECEDED by an in-app
 * disclosure with an affirmative action, exactly like the phone-number
 * disclosure on the sign-in screen. This module records that the member saw
 * and accepted the location disclosure; the OS prompt may only fire after it.
 *
 * Versioned like the data disclosure: bumping LOCATION_DISCLOSURE_VERSION
 * re-shows the sheet to everyone (used when the wording or scope changes).
 */
export const LOCATION_DISCLOSURE_VERSION = '2026-08-18.1';

const KEY = 'pyaas_location_disclosure_accepted';

export type LocationDisclosureRecord = {
  version: string;
  /** Language the sheet was ON SCREEN in when the member tapped Agree
   *  ('en' | 'hi'). Optional on READ ONLY: records written before the
   *  bilingual disclosure shipped (stored as a bare version string) lack it
   *  and must keep counting as accepted — same English copy, no version bump. */
  lang?: DiscLang;
  /** ISO moment of the Agree tap. Optional on READ ONLY: records written
   *  before the backend mirror shipped lack it (the server then anchors the
   *  mirrored consent on receive time instead). */
  accepted_at?: string;
};

function parse(raw: string | null): LocationDisclosureRecord | null {
  if (!raw) return null;
  // Legacy format: the bare version string, written before `lang` existed.
  if (!raw.startsWith('{')) return { version: raw };
  try {
    const rec = JSON.parse(raw) as LocationDisclosureRecord;
    return rec && typeof rec.version === 'string' ? rec : null;
  } catch {
    return null;
  }
}

export async function hasAcceptedLocationDisclosure(): Promise<boolean> {
  try {
    return parse(await AsyncStorage.getItem(KEY))?.version === LOCATION_DISCLOSURE_VERSION;
  } catch {
    return false;
  }
}

/** Record acceptance. `lang` is the language showing at the moment of the
 *  Agree tap; defaults to the shared disclosure-language store at call time. */
export async function recordLocationDisclosureAccepted(lang: DiscLang = getDiscLang()): Promise<void> {
  const rec: LocationDisclosureRecord = {
    version: LOCATION_DISCLOSURE_VERSION,
    lang,
    accepted_at: new Date().toISOString(),
  };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(rec));
    // Backend mirror seam (disclosure_location): durable-queue the push.
    // Storage-only + error-swallowed — the Agree flow is unchanged.
    await queueConsentMirror();
  } catch {
    // Storage blip: the sheet shows again next time. Never blocks the flow.
  }
}

/** The audit record (null if never accepted). */
export async function getLocationDisclosureRecord(): Promise<LocationDisclosureRecord | null> {
  try {
    return parse(await AsyncStorage.getItem(KEY));
  } catch {
    return null;
  }
}
