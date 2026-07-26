import React, { useEffect, useState } from 'react';
import { View, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, radius, spacing, shadow, rupee } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Button, Tap } from './ui';
import { useAuth } from '../lib/auth';
import { useWallet } from '../store/wallet';
import { shouldShowFreePack, claimFreePack, markSeen, FREE_PACK_VALUE } from '../lib/freePack';

/**
 * Welcome offer: a free pack of milk on first install, shown once per device to
 * a signed-in, still-eligible member. The reward is a promotional wallet credit
 * worth one 500 ml pack, applied to their first order. Anti-abuse (one per phone
 * + one per device + server phone-uniqueness) lives in lib/freePack.
 * Mounted once from the tabs layout.
 */
export function FreePackGate() {
  const { profile } = useAuth();
  const phone = profile?.phone ?? '';
  const refreshWallet = useWallet((s) => s.refresh);
  const [visible, setVisible] = useState(false);
  const [claimed, setClaimed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let on = true;
    if (phone) shouldShowFreePack(phone).then((show) => { if (on) setVisible(show); });
    return () => { on = false; };
  }, [phone]);

  async function claim() {
    if (!phone) return;
    setBusy(true);
    try {
      const r = await claimFreePack(phone);
      if (r.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setClaimed(true);
        await refreshWallet();
      } else {
        setVisible(false); // already claimed elsewhere; do not nag
      }
    } finally { setBusy(false); }
  }

  function close() {
    markSeen();
    setVisible(false);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <View style={{ flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: spacing.xl }}>
        <View style={{ backgroundColor: colors.white, borderRadius: radius.xl, overflow: 'hidden', ...shadow.card }}>
          {/* Solid flame header (no gradient) */}
          <View style={{ backgroundColor: colors.flameDeep, alignItems: 'center', paddingTop: spacing.xl, paddingBottom: spacing.lg, gap: 8 }}>
            <View style={{ width: 68, height: 68, borderRadius: 34, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name={claimed ? 'checkmark' : 'gift'} size={34} color={colors.white} />
            </View>
            <Serif color={colors.white} style={{ fontSize: 24, textAlign: 'center' }}>
              {claimed ? 'Your milk is on us' : 'Welcome to PARAG'}
            </Serif>
          </View>

          <View style={{ padding: spacing.lg, gap: spacing.md, alignItems: 'center' }}>
            {claimed ? (
              <>
                <TextBody style={{ fontSize: 14.5, textAlign: 'center', lineHeight: 22 }}>
                  We have added a {rupee(FREE_PACK_VALUE)} welcome credit, worth one 500 ml pack of Parag Taaza milk, to your wallet. It applies to your first order.
                </TextBody>
                <Button title="Start shopping" onPress={close} style={{ alignSelf: 'stretch' }} />
              </>
            ) : (
              <>
                <TextSemi style={{ fontSize: 17, textAlign: 'center' }}>Your first pack of milk is free.</TextSemi>
                <TextBody style={{ fontSize: 14, textAlign: 'center', lineHeight: 21 }}>
                  A free 500 ml pack of Parag Taaza on us. We add a {rupee(FREE_PACK_VALUE)} welcome credit to your wallet that covers it on your first order.
                </TextBody>
                <Button title="Claim my free pack" onPress={claim} loading={busy} style={{ alignSelf: 'stretch' }} />
                <Tap haptic={false} onPress={close} style={{ paddingVertical: 4 }}>
                  <TextMed color={colors.inkMute} style={{ fontSize: 13.5 }}>Maybe later</TextMed>
                </Tap>
                <TextBody style={{ fontSize: 11, textAlign: 'center' }} color={colors.inkMute}>
                  One free pack per customer and per device. Cannot be exchanged for cash or combined with other offers.
                </TextBody>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}
