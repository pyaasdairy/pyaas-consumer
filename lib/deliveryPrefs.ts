import { requireUserId, getUserId } from './session';
import { getSingle, putSingle } from './localStore';
import { api } from './apiClient';
import { registerMirrorHandler, enqueueMirror, type MirrorOutcome } from './mirrorQueue';

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
  // Durable server mirror: the RIDER reads these off the delivery task, so a
  // preference that only lives in this phone was a promise the doorstep never
  // received (call-before, ring-bell, drop notes).
  await enqueueMirror('delivery-prefs');
}

registerMirrorHandler('delivery-prefs', async (): Promise<MirrorOutcome> => {
  const uid = await getUserId();
  if (!uid) return 'done';
  const p = (await getSingle<DeliveryPrefs>('delivery_prefs', uid)) ?? DEFAULT_PREFS;
  await api.patch('/me', {
    delivery_prefs: {
      call_before: p.call_before,
      ring_bell: p.ring_bell,
      notes: p.notes ?? '',
    },
  });
  return 'done';
});
