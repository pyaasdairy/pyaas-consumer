import { requireUserId, getUserId } from './session';
import { getSingle, putSingle } from './localStore';

export type DeliveryPrefs = {
  call_before: boolean;
  ring_bell: boolean;
  voice_instructions_url: string | null;
  door_image_url: string | null;
  notes: string | null;
};

export const DEFAULT_PREFS: DeliveryPrefs = {
  call_before: false,
  // Default drop style is HANG IT OUTSIDE: the 5 AM delivery wakes nobody
  // unless the member explicitly asks for the bell.
  ring_bell: false,
  voice_instructions_url: null,
  door_image_url: null,
  notes: null,
};

export async function getDeliveryPrefs(): Promise<DeliveryPrefs> {
  const uid = await getUserId();
  if (!uid) return { ...DEFAULT_PREFS };
  const row = await getSingle<DeliveryPrefs>('delivery_prefs', uid);
  return row ?? { ...DEFAULT_PREFS };
}

export async function saveDeliveryPrefs(prefs: Partial<DeliveryPrefs>): Promise<void> {
  const uid = await requireUserId();
  const current = (await getSingle<DeliveryPrefs>('delivery_prefs', uid)) ?? { ...DEFAULT_PREFS };
  await putSingle<DeliveryPrefs>('delivery_prefs', uid, { ...current, ...prefs });
}
