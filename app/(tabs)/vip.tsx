/**
 * FOUNDING FAMILY — the centre PYAAS button (pyaas-app-spec.md screens 4 and 7).
 *
 * Replaces the PYAAS Plus screen (founder call, 21 Sep): same animated name
 * card, new model. A non-member (or a stopped one) sees what ₹99 a month gets
 * them and "Pick your farm". A member sees their farm, their place in line,
 * how many homes are left to unlock it, and one share button.
 *
 * Everything shown comes from GET /consumer/founding-family (lib/foundingFamily).
 * Without it the screen says Founding Family is opening soon: no farm, price or
 * status is ever typed into the app.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, Alert, Linking, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useSharedValue, useAnimatedScrollHandler, withRepeat, withTiming, Easing, cancelAnimation, FadeInDown } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, rupee, tabular } from '../../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap } from '../../components/ui';
import { useTabBarClearance } from '../../components/PyaasTabBar';
import { HoloCard, PerkGem, ShineButton } from '../../components/FoundingCard';
import { FloatingParticles } from '../../components/Fx';
import { haptics } from '../../lib/haptics';
import { getProfile } from '../../lib/session';
import { SITE_URL } from '../../lib/support';
import {
  foundingShareMessage,
  getFoundingFamily,
  homesToGo,
  savingsLine,
  stopFoundingFamily,
  type FoundingFamilyView,
} from '../../lib/foundingFamily';

// What ₹99 a month gets you — the spec's four benefits, in One Voice words
// (pyaas-one-voice.md §1.3, §1.4, §2.1 #6).
const PERKS: { icon: 'bicycle' | 'pricetag' | 'star' | 'arrow-up'; color: string; title: string; body: string }[] = [
  { icon: 'bicycle', color: colors.blue, title: 'Free delivery, every morning', body: 'Delivery is free above ₹199, and ₹5 below it. Members never pay it.' },
  { icon: 'pricetag', color: colors.flameDeep, title: '₹2 off every litre', body: 'On all PYAAS milk: Single Farm Milk and Family Farms Milk.' },
  { icon: 'star', color: colors.goldDeep, title: 'Your farm, your place', body: 'Your spot at your farm is kept; milk first at launch.' },
  { icon: 'arrow-up', color: colors.flame, title: 'Bring a neighbour, get milk sooner', body: 'Each friend who joins moves you up.' },
];

export default function FoundingFamily() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const tabClearance = useTabBarClearance();
  const [view, setView] = useState<FoundingFamilyView | null>(null);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => { scrollY.value = e.contentOffset.y; });
  const bob = useSharedValue(0);
  useEffect(() => {
    bob.value = withRepeat(withTiming(1, { duration: 2600, easing: Easing.inOut(Easing.ease) }), -1, false);
    return () => cancelAnimation(bob);
  }, [bob]);

  const load = useCallback(async () => {
    const [v, p] = await Promise.all([getFoundingFamily(), getProfile().catch(() => null)]);
    setView(v);
    setName(((p as { full_name?: string } | null)?.full_name ?? '').trim());
    setLoading(false);
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const member = view?.member && view.member.status !== 'stopped' ? view.member : null;
  const stopped = view?.member?.status === 'stopped';
  const farm = member ? view?.farms.find((f) => f.id === member.farm_id) ?? null : null;
  const first = name.split(' ')[0] || '';
  const cardName = (name || 'Your name').toUpperCase();
  const save = savingsLine(view);

  function share() {
    if (!member) return;
    const msg = foundingShareMessage(farm, member.referral_code, SITE_URL);
    const wa = `whatsapp://send?text=${encodeURIComponent(msg)}`;
    Linking.openURL(wa).catch(() => { void Share.share({ message: msg }); });
  }

  function confirmStop() {
    Alert.alert(
      'Stop Founding Family?',
      'Your perks run to the end of the month you have paid for. You can join again any time.',
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try { await stopFoundingFamily(); haptics.confirm(); await load(); }
            catch (e: any) { Alert.alert('Could not stop', e?.message ?? 'Please try again.'); }
            finally { setBusy(false); }
          },
        },
      ],
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.milk, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.flameDeep} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: tabClearance, gap: spacing.md }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ paddingHorizontal: spacing.lg, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Serif style={{ fontSize: 28, flex: 1 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>Founding Family</Serif>
          <TextMed style={{ fontSize: 12.5, flexShrink: 0 }} color={colors.inkMute}>Lucknow</TextMed>
        </View>

        {/* THE CARD — with the member's name, as on the Plus screen. For a member
            the foil number is their place in line. */}
        <View style={{ alignItems: 'center', paddingVertical: spacing.sm, overflow: 'hidden' }}>
          <FloatingParticles count={10} height={230} />
          <HoloCard
            scrollY={scrollY}
            num={member?.line_number ?? null}
            lineOne="PLACE"
            lineTwo="IN LINE"
            memberLine={cardName}
          />
        </View>

        {member ? (
          // ── Screen 7 · You're in ────────────────────────────────────────────
          <Animated.View entering={FadeInDown.duration(380)} style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 6, ...shadow.soft }}>
              <TextMed style={{ fontSize: 12 }} color={colors.inkMute}>Your farm</TextMed>
              <TextSemi style={{ fontSize: 17 }}>{farm ? `${farm.name} · ${farm.farmer}` : 'Your farm'}</TextSemi>
              <TextBody style={{ fontSize: 13 }} color={colors.inkSoft}>Welcome to the Founding Family{first ? `, ${first}` : ''}.</TextBody>
            </View>

            {member.line_number != null ? (
              <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 2, ...shadow.soft }}>
                <TextMed style={{ fontSize: 12 }} color={colors.inkMute}>Your place in line</TextMed>
                <Serif style={{ fontSize: 30, ...tabular }}>#{member.line_number}</Serif>
              </View>
            ) : null}

            {farm ? (
              farm.status === 'unlocked' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.liveSoft, borderRadius: radius.lg, padding: spacing.md }}>
                  <Ionicons name="checkmark-circle" size={20} color={colors.live} />
                  <TextSemi style={{ fontSize: 14.5, flex: 1 }}>Your farm is delivering</TextSemi>
                </View>
              ) : (
                <View style={{ backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, gap: 8, ...shadow.soft }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <TextSemi style={{ fontSize: 14.5, flex: 1 }}>{homesToGo(farm)} more {homesToGo(farm) === 1 ? 'home' : 'homes'} to unlock {farm.name.replace(/ Dairy.*$/, '')}</TextSemi>
                    <TextMed style={{ fontSize: 12, ...tabular }} color={colors.inkMute}>{farm.claimed} of {farm.unlocks_at}</TextMed>
                  </View>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}>
                    <View style={{ height: 6, borderRadius: 3, backgroundColor: colors.flameDeep, width: `${Math.min(100, Math.round((farm.claimed / Math.max(1, farm.unlocks_at)) * 100))}%` }} />
                  </View>
                </View>
              )
            ) : null}

            <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md, gap: 4 }}>
              <TextSemi style={{ fontSize: 14.5 }}>Refer a friend, move up the line</TextSemi>
              <TextBody style={{ fontSize: 13, lineHeight: 19 }} color={colors.inkSoft}>
                Each friend who joins moves you up.{farm && farm.status === 'filling' ? ` If they claim ${farm.name}, it unlocks sooner too.` : ''}
              </TextBody>
            </View>

            <ShineButton title="Share on WhatsApp" onPress={share} />

            <Tap haptic={false} onPress={busy ? undefined : confirmStop} style={{ alignSelf: 'center', paddingVertical: 8 }}>
              <TextMed color={colors.inkMute} style={{ fontSize: 13 }}>{busy ? 'Stopping…' : 'Stop Founding Family'}</TextMed>
            </Tap>
          </Animated.View>
        ) : (
          // ── Screen 4 · Founding Family (non-member) ─────────────────────────
          <Animated.View entering={FadeInDown.duration(380)} style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            <View style={{ gap: 4 }}>
              <Serif style={{ fontSize: 22 }}>Whole milk from one farm you choose</Serif>
              <TextBody style={{ fontSize: 13.5 }} color={colors.inkSoft}>The farmer’s name is on your bottle.</TextBody>
            </View>

            <TextSemi style={{ fontSize: 15.5 }}>What your ₹99 a month gets you</TextSemi>
            <View style={{ gap: 10 }}>
              {PERKS.map((p, i) => (
                <View key={p.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: 12, ...shadow.soft }}>
                  <PerkGem perk={p} bob={bob} phase={i * 0.25} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <TextSemi style={{ fontSize: 14.5 }}>{p.title}</TextSemi>
                    <TextBody style={{ fontSize: 12.5, lineHeight: 18 }} color={colors.inkSoft}>{p.body}</TextBody>
                  </View>
                </View>
              ))}
            </View>

            {save ? (
              <TextMed style={{ fontSize: 13, textAlign: 'center', ...tabular }} color={colors.live}>
                1 L a day saves {rupee(save.saves)} a month ({rupee(save.without)} vs {rupee(save.withMembership)})
              </TextMed>
            ) : null}

            {view ? (
              <>
                <View style={{ alignItems: 'center', gap: 2 }}>
                  <Serif style={{ fontSize: 30, ...tabular }}>{rupee(view.price_month)} <TextMed style={{ fontSize: 14 }} color={colors.inkMute}>/month</TextMed></Serif>
                  <TextBody style={{ fontSize: 12.5 }} color={colors.inkMute}>starts when your farm opens · stop any month</TextBody>
                </View>
                <ShineButton title={stopped ? 'Re-join · pick your farm' : 'Pick your farm'} onPress={() => router.push('/founding-family/farms')} />
              </>
            ) : (
              // The backend does not offer it yet: say so, and show nothing made up.
              <View style={{ backgroundColor: colors.cream, borderRadius: radius.lg, padding: spacing.md, alignItems: 'center', gap: 4 }}>
                <TextSemi style={{ fontSize: 15 }}>Founding Family opens in the app soon</TextSemi>
                <TextBody style={{ fontSize: 12.5, textAlign: 'center' }} color={colors.inkSoft}>
                  Parag milk, ghee and the wallet are open to you now.
                </TextBody>
              </View>
            )}
          </Animated.View>
        )}
      </Animated.ScrollView>
    </View>
  );
}
