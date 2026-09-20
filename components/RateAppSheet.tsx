import React, { useState } from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { SafeModal } from './SafeModal';
import { colors, radius, spacing, shadow } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Field, Tap } from './ui';
import { haptics } from '../lib/haptics';
import { usePopupSlot } from '../lib/popupGate';
import { markAsked, markRatingSettled, openStoreReview } from '../lib/appReview';
import { fileComplaint } from '../lib/complaints';

/**
 * RATE THE APP — asked in-app, answered honestly.
 *
 * Five stars in a sheet. EVERY rating is offered the store, and every rating is
 * offered the "tell us what went wrong" box: the two sit side by side and the
 * member picks.
 *
 * It used to branch — 4-5 stars went to the store, 1-3 were routed into the
 * complaint register instead and never saw it. Both Apple and Google forbid
 * that (filtering who is asked to review by how they feel is exactly the
 * practice the rules name), and this app has already been removed from a store
 * once. Offering help to an unhappy member is right; withholding the store from
 * them is not.
 *
 * "Not now" is remembered (60-day cooldown); rating or sending feedback settles
 * it for good, so nobody is asked twice.
 */
export function RateAppSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  usePopupSlot(visible);
  const [stars, setStars] = useState(0);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sentRef, setSentRef] = useState<string | null>(null);

  const happy = stars >= 4;

  function close() {
    onClose();
    // Reset so a later ask opens clean.
    setTimeout(() => { setStars(0); setDetail(''); setSentRef(null); }, 250);
  }

  async function later() {
    await markAsked();
    close();
  }

  async function toStore() {
    await markRatingSettled();
    await openStoreReview();
    close();
  }

  async function sendFeedback() {
    if (!detail.trim()) return;
    setBusy(true);
    try {
      const c = await fileComplaint({
        category: 'app',
        detail: `In-app rating: ${stars}/5\n\n${detail.trim()}`,
      });
      await markRatingSettled();
      haptics.confirm();
      setSentRef(c.ref);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeModal visible={visible} transparent animationType="fade" onRequestClose={later}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlay }}>
        <Pressable style={{ flex: 1 }} onPress={later} accessibilityLabel="Dismiss" />
        <Animated.View
          entering={FadeInDown.duration(320)}
          style={{ backgroundColor: colors.milk, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, paddingBottom: insets.bottom + spacing.lg, gap: spacing.md, ...shadow.card }}
        >
          <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line }} />

          {sentRef ? (
            <Animated.View entering={FadeIn.duration(240)} style={{ alignItems: 'center', gap: 10, paddingVertical: spacing.md }}>
              <Ionicons name="checkmark-circle" size={56} color={colors.live} />
              <Serif style={{ fontSize: 21, textAlign: 'center' }}>Thank you, that helps</Serif>
              <TextBody style={{ fontSize: 13.5, textAlign: 'center', lineHeight: 20 }} color={colors.inkSoft}>
                Your feedback is registered as {sentRef}. You can follow it in Help and support under My complaints.
              </TextBody>
              <Tap onPress={close} style={{ alignSelf: 'stretch', marginTop: 4 }}>
                <View style={{ height: 52, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center' }}>
                  <TextSemi color={colors.white} style={{ fontSize: 15.5 }}>Done</TextSemi>
                </View>
              </Tap>
            </Animated.View>
          ) : (
            <>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="heart" size={24} color={colors.flameDeep} />
                </View>
                <Serif style={{ fontSize: 22, textAlign: 'center' }}>How is PYAAS treating you?</Serif>
                <TextBody style={{ fontSize: 13, textAlign: 'center' }} color={colors.inkSoft}>
                  Tap the stars. It takes a second and it shapes what we fix next.
                </TextBody>
              </View>

              {/* The stars */}
              <View style={{ flexDirection: 'row', alignSelf: 'center', gap: 8 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Tap
                    key={n}
                    haptic={false}
                    onPress={() => { haptics.select(); setStars(n); }}
                    accessibilityRole="button"
                    accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`}
                    accessibilityState={{ selected: stars >= n }}
                    style={{ padding: 4 }}
                  >
                    <Ionicons name={stars >= n ? 'star' : 'star-outline'} size={34} color={stars >= n ? colors.warn : colors.inkMute} />
                  </Tap>
                ))}
              </View>

              {stars === 0 ? null : (
                <Animated.View entering={FadeIn.duration(220)} style={{ gap: 10 }}>
                  <TextBody style={{ fontSize: 13.5, textAlign: 'center', lineHeight: 20 }} color={colors.inkSoft}>
                    {happy
                      ? 'That is lovely to hear. Would you leave the same rating on the store? It genuinely helps a young dairy.'
                      : 'Thank you for saying so. Tell us what to fix and we will act on it — and you are welcome to leave this rating on the store too.'}
                  </TextBody>

                  {/* The store is offered to EVERY rating — see the note above. */}
                  <Tap onPress={toStore}>
                    <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, ...shadow.soft }}>
                      <TextSemi color={colors.white} style={{ fontSize: 16 }}>Rate us on the store</TextSemi>
                      <Ionicons name="arrow-forward" size={17} color={colors.white} />
                    </View>
                  </Tap>

                  {/* ...and so is the chance to tell us directly. An unhappy
                      member gets the box opened for them; a happy one can still
                      reach it. Neither replaces the other. */}
                  <TextMed style={{ fontSize: 13.5, marginTop: 2 }}>
                    {happy ? 'Anything we could do better?' : 'What went wrong? We read every one of these.'}
                  </TextMed>
                  <Field
                    label=""
                    value={detail}
                    onChangeText={setDetail}
                    placeholder="Tell us what to fix"
                    multiline
                    style={{ minHeight: 88, textAlignVertical: 'top' }}
                  />
                  <Tap onPress={busy || !detail.trim() ? undefined : sendFeedback}>
                    <View style={{ height: 54, borderRadius: radius.pill, backgroundColor: detail.trim() ? colors.ink : colors.line, alignItems: 'center', justifyContent: 'center', opacity: detail.trim() ? 1 : 0.8 }}>
                      {busy ? <ActivityIndicator color={colors.white} /> : (
                        <TextSemi color={colors.white} style={{ fontSize: 16 }}>Send to our team</TextSemi>
                      )}
                    </View>
                  </Tap>
                </Animated.View>
              )}

              <Tap haptic={false} onPress={later} style={{ alignSelf: 'center', paddingVertical: 6 }}>
                <TextMed color={colors.inkMute} style={{ fontSize: 13.5 }}>Not now</TextMed>
              </Tap>
            </>
          )}
        </Animated.View>
      </View>
    </SafeModal>
  );
}

export default RateAppSheet;
