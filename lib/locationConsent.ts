import AsyncStorage from '@react-native-async-storage/async-storage';

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

export async function hasAcceptedLocationDisclosure(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) === LOCATION_DISCLOSURE_VERSION;
  } catch {
    return false;
  }
}

export async function recordLocationDisclosureAccepted(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, LOCATION_DISCLOSURE_VERSION);
  } catch {
    // Storage blip: the sheet shows again next time. Never blocks the flow.
  }
}
