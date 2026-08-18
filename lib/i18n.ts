import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * DISCLOSURE LANGUAGE — English / Hindi for the CONSENT SURFACES only.
 *
 * Play's prominent-disclosure rules only work if the member can actually read
 * the disclosure. A large share of PYAAS members in Lucknow read Hindi more
 * comfortably than English, so the three consent surfaces (DataDisclosure,
 * ConsentWelcome, LocationDisclosure) and the inline sign-in caption render in
 * either language behind a shared toggle, and the acceptance records store
 * WHICH language was on screen at the moment of the tap.
 *
 * Scope is deliberately narrow: these tables cover the consent surfaces, not
 * the whole app, and NOT app/privacy-policy.tsx (a legal document that gets a
 * professional translation separately — the in-app links keep pointing at the
 * English policy either way).
 *
 * Store shape follows lib/deliveryMode.ts: module-level state + subscribe, so
 * the hook and the imperative getter always agree, with a best-effort
 * AsyncStorage persistence layered on (hydrated on first use; an explicit
 * choice always beats a late hydration read).
 */
export type DiscLang = 'en' | 'hi';

const STORAGE_KEY = 'pyaas_disc_lang';

let lang: DiscLang = 'en';
/** Set the moment the member picks a language; a slower hydration read must never override it. */
let touched = false;
let hydrateStarted = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

/** Best-effort, once: pull the persisted choice on first use of the store. */
function ensureHydrated(): void {
  if (hydrateStarted) return;
  hydrateStarted = true;
  AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (touched) return;
      if ((raw === 'en' || raw === 'hi') && raw !== lang) {
        lang = raw;
        emit();
      }
    })
    .catch(() => {
      /* best-effort: default 'en' stands */
    });
}

export function getDiscLang(): DiscLang {
  ensureHydrated();
  return lang;
}

export function setDiscLang(next: DiscLang): void {
  touched = true;
  ensureHydrated();
  if (next !== lang) {
    lang = next;
    emit();
  }
  AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {
    /* best-effort: worst case the toggle resets to English next launch */
  });
}

function subscribe(listener: () => void): () => void {
  ensureHydrated();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** React hook — re-renders when the shared disclosure language changes. */
export function useDiscLang(): DiscLang {
  return useSyncExternalStore(subscribe, getDiscLang, getDiscLang);
}

// ─── String tables ────────────────────────────────────────────────────────────

type FlowStrings = { what: string; why: string };

/** Exactly one entry per icon in DataDisclosure's FLOW_ICONS, same order —
 *  the tuple length makes "a language is missing a disclosed flow" a compile
 *  error, because dropping a data category from ONE language would be exactly
 *  the under-disclosure defect this app was removed for. */
type FlowTable = readonly [
  FlowStrings, FlowStrings, FlowStrings, FlowStrings,
  FlowStrings, FlowStrings, FlowStrings, FlowStrings,
];

export type DiscStrings = {
  /** Shared consent actions. */
  agree: string;
  notNow: string;
  /** "Full details in our {privacy} and {terms}." — split so the two link
   *  spans stay tappable in both languages. */
  fullDetails: { prefix: string; privacy: string; middle: string; terms: string; suffix: string };
  /** The disclosed data flows (DataDisclosure modal + ConsentWelcome). */
  flows: FlowTable;
  data: {
    title: string;
    intro: string;
    neverSell: string;
    welcomeHeadline: string;
    welcomeIntro: string;
    welcomeBadge: string;
    agreeA11y: string;
    declinedNote: string;
  };
  location: {
    title: string;
    para1: string;
    para2: string;
    fallback: string;
  };
  /** Inline caption above "Send verification code" on the sign-in screen. */
  otpCaption: string;
};

const en: DiscStrings = {
  agree: 'Agree and continue',
  notNow: 'Not now',
  fullDetails: {
    prefix: 'Full details in our ',
    privacy: 'Privacy Policy',
    middle: ' and ',
    terms: 'Terms',
    suffix: '.',
  },
  flows: [
    {
      // Names the SIM read explicitly. This is the exact capability Google
      // enforced on: the Play Services chooser reads the number off the SIM,
      // and because that API needs no Android permission the OS shows no
      // dialog. If the disclosure does not say it, nothing does.
      what: 'Your mobile number',
      why: 'Sent to and stored on PYAAS servers as your account id, and sent to our SMS provider to text you a one-time code. We keep it while your account exists; deleting your account removes it. If you tap "use the number on this phone", we read the number from your SIM so you do not have to type it.',
    },
    {
      what: 'The sign-in code we text you',
      why: 'On Android we read that one message automatically so the code fills itself in. We cannot read any of your other messages.',
    },
    {
      what: 'Your delivery address and location',
      why: 'Stored on PYAAS servers so we know where to deliver. Only collected when you set an address or tap "use my location".',
    },
    {
      // The address-search field streams what you type to Google on a 250ms
      // debounce (lib/places.ts). That is a third-party recipient of address
      // data, and it was previously disclosed nowhere — the same defect shape
      // that had this app removed, on a second data type.
      what: 'What you type in address search',
      why: 'Sent to Google Maps as you type, so it can suggest real addresses. Skip it by picking your city and dropping a pin on the map instead.',
    },
    {
      // Tile requests carry z/x/y plus the IP, which tells OpenStreetMap which
      // block is on screen. leafletAssets.ts already inlines the Leaflet
      // library to remove one undisclosed third-party call; the tiles were the
      // hole left in that reasoning.
      what: 'The map, when you open it',
      why: 'Map images come from OpenStreetMap, so it can see roughly which area you are looking at.',
    },
    {
      what: 'A device identifier',
      why: 'A random id stored on this phone, so a one-time offer cannot be claimed over and over on the same device. It is not your advertising id and we do not track you with it.',
    },
    {
      what: 'When you pay',
      why: 'Your name, mobile number and email are sent to Razorpay, our payment processor, to open the payment screen and process the charge. Card and UPI details go to Razorpay directly and never touch PYAAS servers.',
    },
    {
      what: 'Your orders and wallet activity',
      why: 'Stored on PYAAS servers to run deliveries, subscriptions and refunds, and to issue your bills.',
    },
  ],
  data: {
    title: 'Before you sign in',
    intro: 'Here is exactly what PYAAS collects, what we use it for, and who else sees it.',
    neverSell:
      'We never sell your personal data. You can delete your account and its data at any time from your profile.',
    welcomeHeadline: 'Fresh milk,\nnothing hidden',
    welcomeIntro:
      'Before you sign in, here is exactly what PYAAS collects, what we use it for, and who else sees it.',
    welcomeBadge: 'We never sell your data · delete your account anytime',
    agreeA11y: 'Agree and continue to sign in',
    declinedNote:
      "No problem. Nothing is collected until you agree, and PYAAS can't sign you in without it. Agree whenever you're ready.",
  },
  location: {
    title: 'Your location',
    para1:
      'PYAAS collects your precise device location, only while you use the app and only when you tap a location button, to pin your exact delivery doorstep, check that we deliver in your area, and route your morning delivery.',
    para2:
      'The point you choose is sent to and stored on PYAAS servers as your saved delivery address. It is never sold, never used for advertising, and never read in the background. We use precise location because a doorstep delivery needs an exact pin, not a neighbourhood.',
    fallback: 'You can always type your address or pick your city instead.',
  },
  otpCaption:
    'PYAAS sends and stores your mobile number on our servers and sends it to our SMS provider to text you a one-time code and create your account.',
};

// Hindi: faithful, natural Devanagari renderings of the SAME copy — every data
// category, recipient and right above appears here too, nothing added, nothing
// dropped. Brand and protocol words (PYAAS, OTP, SMS, SIM, UPI, Android,
// Google Maps, OpenStreetMap, Razorpay) stay in Latin script.
const hi: DiscStrings = {
  agree: 'सहमत हूँ, आगे बढ़ें',
  notNow: 'अभी नहीं',
  fullDetails: {
    prefix: 'पूरा विवरण हमारी ',
    privacy: 'गोपनीयता नीति',
    middle: ' और ',
    terms: 'शर्तों',
    suffix: ' में।',
  },
  flows: [
    {
      what: 'आपका मोबाइल नंबर',
      why: 'आपकी अकाउंट आईडी के रूप में PYAAS सर्वर पर भेजा और सुरक्षित रखा जाता है, और आपको SMS से वन-टाइम कोड भेजने के लिए हमारे SMS प्रदाता को भेजा जाता है। जब तक आपका खाता है, हम इसे रखते हैं; खाता हटाने पर यह भी हट जाता है। अगर आप "इस फ़ोन का नंबर इस्तेमाल करें" पर टैप करते हैं, तो हम आपकी SIM से नंबर पढ़ लेते हैं ताकि आपको टाइप न करना पड़े।',
    },
    {
      what: 'साइन-इन कोड जो हम आपको SMS से भेजते हैं',
      why: 'Android पर हम सिर्फ़ वही एक संदेश अपने-आप पढ़ते हैं ताकि कोड खुद भर जाए। आपके बाकी संदेशों में से हम कोई भी नहीं पढ़ सकते।',
    },
    {
      what: 'आपका डिलीवरी पता और लोकेशन',
      why: 'PYAAS सर्वर पर सुरक्षित रखा जाता है ताकि हमें पता रहे कि डिलीवरी कहाँ करनी है। यह सिर्फ़ तभी लिया जाता है जब आप कोई पता सेट करते हैं या "मेरी लोकेशन इस्तेमाल करें" पर टैप करते हैं।',
    },
    {
      what: 'पता खोजते समय आप जो टाइप करते हैं',
      why: 'आपके टाइप करते-करते Google Maps को भेजा जाता है ताकि वह असली पते सुझा सके। चाहें तो इसे छोड़ सकते हैं — इसकी जगह अपना शहर चुनें और नक्शे पर पिन लगा दें।',
    },
    {
      what: 'नक्शा, जब आप उसे खोलते हैं',
      why: 'नक्शे की तस्वीरें OpenStreetMap से आती हैं, इसलिए वह मोटे तौर पर देख सकता है कि आप कौन-सा इलाक़ा देख रहे हैं।',
    },
    {
      what: 'एक डिवाइस आईडी',
      why: 'इस फ़ोन पर रखी गई एक रैंडम आईडी, ताकि एक बार वाला ऑफ़र एक ही डिवाइस पर बार-बार न लिया जा सके। यह आपकी विज्ञापन आईडी नहीं है और हम इससे आपको ट्रैक नहीं करते।',
    },
    {
      what: 'जब आप भुगतान करते हैं',
      why: 'भुगतान स्क्रीन खोलने और भुगतान लेने के लिए आपका नाम, मोबाइल नंबर और ईमेल हमारे भुगतान प्रोसेसर Razorpay को भेजे जाते हैं। कार्ड और UPI की जानकारी सीधे Razorpay के पास जाती है और कभी PYAAS सर्वर तक नहीं पहुँचती।',
    },
    {
      what: 'आपके ऑर्डर और वॉलेट की गतिविधि',
      why: 'डिलीवरी, सब्सक्रिप्शन और रिफ़ंड चलाने और आपके बिल जारी करने के लिए PYAAS सर्वर पर सुरक्षित रखी जाती है।',
    },
  ],
  data: {
    title: 'साइन इन करने से पहले',
    intro: 'यहाँ ठीक-ठीक बताया गया है कि PYAAS क्या इकट्ठा करता है, हम उसका इस्तेमाल किस लिए करते हैं, और उसे और कौन देखता है।',
    neverSell:
      'हम आपका निजी डेटा कभी नहीं बेचते। आप अपनी प्रोफ़ाइल से कभी भी अपना खाता और उसका डेटा हटा सकते हैं।',
    welcomeHeadline: 'ताज़ा दूध,\nकुछ भी छिपा नहीं',
    welcomeIntro:
      'साइन इन करने से पहले, यहाँ ठीक-ठीक बताया गया है कि PYAAS क्या इकट्ठा करता है, हम उसका इस्तेमाल किस लिए करते हैं, और उसे और कौन देखता है।',
    welcomeBadge: 'हम आपका डेटा कभी नहीं बेचते · खाता कभी भी हटा सकते हैं',
    agreeA11y: 'सहमत हूँ, साइन इन के लिए आगे बढ़ें',
    declinedNote:
      'कोई बात नहीं। जब तक आप सहमत नहीं होते, कुछ भी इकट्ठा नहीं होता, और इसके बिना PYAAS आपको साइन इन नहीं कर सकता। जब तैयार हों, तब सहमति दें।',
  },
  location: {
    title: 'आपकी लोकेशन',
    para1:
      'PYAAS आपके डिवाइस की सटीक लोकेशन लेता है — सिर्फ़ ऐप इस्तेमाल करते समय और सिर्फ़ तब जब आप किसी लोकेशन बटन पर टैप करते हैं — ताकि आपकी डिलीवरी के लिए ठीक आपके दरवाज़े पर पिन लगे, यह जाँच हो सके कि हम आपके इलाक़े में डिलीवरी करते हैं, और आपकी सुबह की डिलीवरी का रास्ता तय हो।',
    para2:
      'आप जो जगह चुनते हैं, वह आपके सहेजे गए डिलीवरी पते के रूप में PYAAS सर्वर पर भेजी और सुरक्षित रखी जाती है। इसे कभी बेचा नहीं जाता, कभी विज्ञापन के लिए इस्तेमाल नहीं किया जाता, और कभी बैकग्राउंड में नहीं पढ़ा जाता। हम सटीक लोकेशन इसलिए लेते हैं क्योंकि दरवाज़े तक डिलीवरी के लिए एक सटीक पिन चाहिए, सिर्फ़ मोहल्ले का नाम नहीं।',
    fallback: 'आप चाहें तो हमेशा अपना पता टाइप कर सकते हैं या अपना शहर चुन सकते हैं।',
  },
  otpCaption:
    'PYAAS आपका मोबाइल नंबर हमारे सर्वर पर भेजता और सुरक्षित रखता है, और आपको SMS से वन-टाइम कोड भेजने तथा आपका खाता बनाने के लिए उसे हमारे SMS प्रदाता को भेजता है।',
};

const TABLES: Record<DiscLang, DiscStrings> = { en, hi };

/** The full string table for a language. */
export function discStrings(l: DiscLang): DiscStrings {
  return TABLES[l];
}
