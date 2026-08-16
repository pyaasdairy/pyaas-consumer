import React, { useCallback, useRef, useState } from 'react';
import { View, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { colors, radius, spacing, shadow, fonts } from '../lib/theme';
import { Serif, TextBody, TextMed, TextSemi, Tap, BackButton } from '../components/ui';
import { haptics } from '../lib/haptics';
import { CARE_EMAIL, HAS_CARE_PHONE, SUPPORT, callCare, emailCare, saveSupportTicket } from '../lib/support';

type From = 'bot' | 'user';
type Msg = { id: string; from: From; text: string };
type Stage = 'issue' | 'detail' | 'rate' | 'done';

const ISSUES: { key: string; label: string; bot: string; chips: string[] }[] = [
  { key: 'missing', label: 'Missing delivery', bot: 'Sorry your delivery did not arrive. Which one was it?', chips: ["Today's milk", "Yesterday's order", 'A subscription day'] },
  { key: 'wrong', label: 'Wrong or damaged item', bot: 'That should not happen. What was wrong with it?', chips: ['Wrong item sent', 'Pack was damaged', 'Pouch was leaking'] },
  { key: 'quality', label: 'Quality or freshness', bot: 'We take quality seriously. What did you notice?', chips: ['Spoiled or sour', 'Off taste or smell', 'Packaging issue'] },
  { key: 'payment', label: 'Payment or wallet', bot: 'Let us sort your payment. What is the issue?', chips: ['Money deducted, no credit', 'Refund not received', 'Recharge failed'] },
  { key: 'subscription', label: 'Subscription or timing', bot: 'Happy to help with your subscription. What do you need?', chips: ['Change delivery time', 'Pause deliveries', 'Cancel subscription'] },
  { key: 'other', label: 'Something else', bot: 'Tell us what you need help with and we will take it from there.', chips: [] },
];

let seq = 0;
const mkId = () => `m${seq++}`;

export default function SupportChat() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [messages, setMessages] = useState<Msg[]>([
    { id: mkId(), from: 'bot', text: 'Hi, I am the PYAAS helper. What can I help you with today?' },
  ]);
  const [stage, setStage] = useState<Stage>('issue');
  const [topicKey, setTopicKey] = useState('');
  const [topicLabel, setTopicLabel] = useState('');
  const [detailChips, setDetailChips] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [detail, setDetail] = useState('');
  const transcriptRef = useRef<{ from: From; text: string }[]>([{ from: 'bot', text: messages[0].text }]);

  const push = useCallback((from: From, text: string) => {
    transcriptRef.current.push({ from, text });
    setMessages((m) => [...m, { id: mkId(), from, text }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
  }, []);

  const pickIssue = (iss: (typeof ISSUES)[number]) => {
    haptics.press();
    push('user', iss.label);
    setTopicKey(iss.key);
    setTopicLabel(iss.label);
    setDetailChips(iss.chips);
    setTimeout(() => push('bot', iss.bot), 250);
    setStage('detail');
  };

  const submitDetail = (text: string) => {
    const t = text.trim();
    if (!t) return;
    haptics.press();
    push('user', t);
    setDetail(t);
    setInput('');
    setDetailChips([]);
    setTimeout(() => {
      // This bot is scripted and saveSupportTicket() only writes to this phone —
      // it used to promise a reply "within 24 hours" that nobody at PYAAS could
      // ever have seen. Say what actually happens instead.
      push('bot', 'Thanks. I have written this down on your phone. I cannot reach the team by myself yet, so one more tap sends it to them.');
      setTimeout(() => push('bot', 'How was this chat experience?'), 500);
      setStage('rate');
    }, 300);
  };

  const rate = async (stars: number) => {
    haptics.success();
    push('user', `${stars} star${stars === 1 ? '' : 's'}`);
    setStage('done');
    await saveSupportTicket({ topic: topicLabel || topicKey, detail, transcript: transcriptRef.current, rating: stars });
    setTimeout(() => push('bot', stars >= 4 ? 'Thank you, that means a lot. Now send this to the team below and we will pick it up from there.' : 'Thank you for the honest feedback. Send this to the team below and a human will take it from here.'), 350);
  };

  /** Hand the whole conversation to the inbox a human reads — the only real exit. */
  const emailTranscript = async () => {
    haptics.press();
    const body = [
      `Topic: ${topicLabel || topicKey || 'Support'}`,
      '',
      ...transcriptRef.current.map((m) => `${m.from === 'bot' ? 'PYAAS helper' : 'Me'}: ${m.text}`),
      '',
      'Sent from the PYAAS app chat',
    ].join('\n');
    const opened = await emailCare(`PYAAS support: ${topicLabel || 'chat'}`, body);
    push('bot', opened
      ? `I have opened your email app with this chat. Send it to ${CARE_EMAIL} and we reply on that thread.`
      : `I could not open your email app. Please write to ${CARE_EMAIL} and paste what you told me.`);
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.milk }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* Header */}
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <BackButton />
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flameSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="chatbubble-ellipses" size={20} color={colors.flameDeep} />
        </View>
        <View style={{ flex: 1 }}>
          <Serif style={{ fontSize: 19 }}>PYAAS helper</Serif>
          <TextBody style={{ fontSize: 11.5 }} color={colors.inkSoft}>Quick answers, then send it to our team</TextBody>
        </View>
        {/* No configured care line → no call button, rather than a dead dial. */}
        {HAS_CARE_PHONE ? (
          <Tap onPress={callCare} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.flameDeep, alignItems: 'center', justifyContent: 'center', ...shadow.soft }}>
            <Ionicons name="call" size={18} color={colors.white} />
          </Tap>
        ) : null}
      </View>

      <ScrollView ref={scrollRef} contentContainerStyle={{ padding: spacing.lg, gap: 10, paddingBottom: 20 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {messages.map((m) => (
          <Bubble key={m.id} from={m.from} text={m.text} />
        ))}

        {/* Quick replies for the current stage */}
        {stage === 'issue' ? (
          <Animated.View entering={FadeIn.duration(240)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
            {ISSUES.map((iss) => (
              <Chip key={iss.key} label={iss.label} onPress={() => pickIssue(iss)} />
            ))}
          </Animated.View>
        ) : null}

        {stage === 'detail' && detailChips.length ? (
          <Animated.View entering={FadeIn.duration(240)} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4, justifyContent: 'flex-end' }}>
            {detailChips.map((c) => (
              <Chip key={c} label={c} onPress={() => submitDetail(c)} />
            ))}
          </Animated.View>
        ) : null}

        {stage === 'rate' ? (
          <Animated.View entering={FadeInDown.duration(300)} style={{ alignSelf: 'center', flexDirection: 'row', gap: 6, marginTop: 6, backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingVertical: 10, paddingHorizontal: 16, ...shadow.soft }}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Tap key={n} haptic={false} onPress={() => rate(n)}>
                <Ionicons name="star-outline" size={30} color={colors.gold} />
              </Tap>
            ))}
          </Animated.View>
        ) : null}

        {stage === 'done' ? (
          <Animated.View entering={FadeInDown.duration(300)} style={{ gap: 10, marginTop: 6 }}>
            <Tap onPress={emailTranscript} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.flameDeep, borderRadius: radius.pill, height: 50, ...shadow.soft }}>
              <Ionicons name="mail" size={18} color={colors.white} />
              <TextSemi color={colors.white} style={{ fontSize: 15 }}>Send this chat to our team</TextSemi>
            </Tap>
            {HAS_CARE_PHONE ? (
              <Tap onPress={callCare} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.white, borderRadius: radius.pill, height: 50, borderWidth: 1, borderColor: colors.line }}>
                <Ionicons name="call" size={18} color={colors.flameDeep} />
                <TextSemi color={colors.flameDeep} style={{ fontSize: 15 }}>Call customer care · {SUPPORT.careNumber}</TextSemi>
              </Tap>
            ) : null}
          </Animated.View>
        ) : null}
      </ScrollView>

      {/* Free-text input, shown while giving details */}
      {stage === 'detail' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: insets.bottom + spacing.sm, backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line }}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Type your message…"
            placeholderTextColor={colors.inkMute}
            style={{ flex: 1, fontFamily: fonts.sans, fontSize: 15, color: colors.ink, backgroundColor: colors.milk, borderRadius: radius.pill, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 16, paddingVertical: Platform.OS === 'ios' ? 12 : 8 }}
            returnKeyType="send"
            onSubmitEditing={() => submitDetail(input)}
          />
          <Tap onPress={() => submitDetail(input)} style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: input.trim() ? colors.flameDeep : colors.line, alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="arrow-up" size={20} color={colors.white} />
          </Tap>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function Bubble({ from, text }: { from: From; text: string }) {
  const isBot = from === 'bot';
  return (
    <Animated.View entering={FadeInDown.duration(260)} style={{ alignSelf: isBot ? 'flex-start' : 'flex-end', maxWidth: '82%' }}>
      <View
        style={{
          backgroundColor: isBot ? colors.white : colors.flameDeep,
          borderColor: isBot ? colors.line : colors.flameDeep,
          borderWidth: 1,
          borderRadius: radius.lg,
          borderBottomLeftRadius: isBot ? 4 : radius.lg,
          borderBottomRightRadius: isBot ? radius.lg : 4,
          paddingHorizontal: 14,
          paddingVertical: 10,
          ...shadow.soft,
        }}
      >
        <TextMed style={{ fontSize: 14.5, lineHeight: 20 }} color={isBot ? colors.ink : colors.white}>{text}</TextMed>
      </View>
    </Animated.View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ backgroundColor: colors.white, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.flameDeep, paddingHorizontal: 14, paddingVertical: 9, ...shadow.soft }}>
      <TextSemi color={colors.flameDeep} style={{ fontSize: 13.5 }}>{label}</TextSemi>
    </Tap>
  );
}
