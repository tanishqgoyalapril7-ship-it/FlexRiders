// Before sign-in: boot splash, first-launch walkthrough, language, Rider/Brand choice; and the location
// pre-prompt shown once after sign-up (the OS prompt only appears when the rider taps Allow).
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useStyles, useTheme } from '../../theme';
import { useT } from '../../i18n';
import { Button, Dots, Header, OptionCard, Screen } from '../../components/ds';

/** Launch screen. It opens exactly like the native splash (same background and logo, same size), then the
 * logo lifts, the wordmark and tagline slide in and three dots pulse while the saved session loads. */
export function BootSplash() {
  const { t } = useT();
  const intro = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(intro, { toValue: 1, duration: 750, delay: 120, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, []);
  const logo = {
    transform: [
      { translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [0, -64] }) },
      { scale: intro.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) },
    ],
  };
  const words = { opacity: intro, transform: [{ translateY: intro.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] };
  const DOT_PHASES = [[1, 0.3, 0.3, 1], [0.3, 1, 0.3, 0.3], [0.3, 0.3, 1, 0.3]];
  return (
    <View style={boot.screen}>
      <View style={boot.center}>
        <Animated.Image source={require('../../../assets/logo-tile.png')} style={[boot.logo, logo]} accessibilityLabel="FlexRiders logo" />
        <Animated.View style={[boot.words, words]}>
          <Text style={boot.name}>
            Flex<Text style={{ color: '#2563EB' }}>Riders</Text>
          </Text>
          <Text style={boot.tag}>{t('Ride. Advertise. Earn.')}</Text>
        </Animated.View>
      </View>
      <View style={boot.dots}>
        {DOT_PHASES.map((out, i) => (
          <Animated.View
            key={i}
            style={[boot.dot, { opacity: pulse.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: out }), transform: [{ scale: pulse.interpolate({ inputRange: [0, 0.33, 0.66, 1], outputRange: out.map((o) => 0.7 + o * 0.3) }) }] }]}
          />
        ))}
      </View>
    </View>
  );
}

const boot = StyleSheet.create({
  // Same background as the native splash (app.json), so the hand-over is invisible.
  screen: { flex: 1, backgroundColor: '#F3F3F3', overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: 110, height: 110 },
  words: { position: 'absolute', top: '50%', marginTop: 22, alignItems: 'center' },
  name: { color: '#0F172A', fontSize: 38, fontWeight: '800', letterSpacing: -0.5 },
  tag: { color: '#64748B', fontSize: 16, fontWeight: '600', marginTop: 6, letterSpacing: 0.3 },
  dots: { flexDirection: 'row', gap: 10, justifyContent: 'center', paddingBottom: 56 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2563EB' },
});

// Illustrations are built from the app's own icons (no stock art); chips describe real app features.
const SLIDES = [
  {
    image: require('../../../assets/onboarding-scooter.png'),
    accent: '#2563EB',
    chips: [['location', 'Campaigns near you'], ['radio', 'Live slots']],
    title: 'Discover Campaigns Near You',
    text: 'Browse high-paying local brand advertisements. Choose routes that match your daily commute and start earning instantly.',
  },
  {
    icon: 'shirt',
    accent: '#16A34A',
    chips: [['camera', '3 photos a day'], ['navigate', 'Your usual routes']],
    title: 'Ride With Brand Gear',
    text: 'Wear the campaign T-shirt, ride your usual routes and upload three quick photos a day.',
  },
  {
    icon: 'wallet',
    accent: '#D97706',
    chips: [['flame', 'Daily streaks'], ['flash', 'Paid to UPI']],
    title: 'Get Paid For Every Approved Day',
    text: 'Track your streaks and earnings in one place. Payouts go straight to your UPI.',
  },
];

function SlideArt({ slide }) {
  const s = useStyles(makeStyles);
  const [a, b] = slide.chips;
  return (
    <View style={[s.art, { backgroundColor: `${slide.accent}14` }]}>
      <View style={[s.ring, { borderColor: `${slide.accent}22` }]} />
      <View style={[s.ring, s.ringInner, { borderColor: `${slide.accent}33` }]} />
      {slide.image ? (
        <View style={[s.heroCard, { shadowColor: slide.accent }]}>
          <Image source={slide.image} style={s.hero} resizeMode="contain" />
        </View>
      ) : (
        <View style={[s.medal, { shadowColor: slide.accent }]}>
          <Ionicons name={slide.icon} size={76} color={slide.accent} />
        </View>
      )}
      <View style={[s.chip, { top: 22, left: 18 }]}>
        <Ionicons name={a[0]} size={15} color={slide.accent} />
        <Text style={s.chipText}>{a[1]}</Text>
      </View>
      <View style={[s.chip, { bottom: 22, right: 18 }]}>
        <Ionicons name={b[0]} size={15} color={slide.accent} />
        <Text style={s.chipText}>{b[1]}</Text>
      </View>
    </View>
  );
}

export function Walkthrough({ onDone }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const width = Dimensions.get('window').width;
  const [index, setIndex] = useState(0);
  const pager = useRef(null);
  const go = (i) => {
    pager.current.scrollTo({ x: i * width, animated: true });
    setIndex(i);
  };
  const last = index === SLIDES.length - 1;
  return (
    <View style={s.screen}>
      <View style={s.topRow}>
        {index > 0 ? (
          <TouchableOpacity onPress={() => go(index - 1)} hitSlop={10} accessibilityLabel="Back" style={s.backBtn}>
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View />
        )}
        {!last ? (
          <TouchableOpacity onPress={onDone} hitSlop={10}>
            <Text style={s.skip}>{t('Skip')}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <ScrollView
        ref={pager}
        horizontal
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: 'stretch' }}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
      >
        {SLIDES.map((slide) => (
          <View key={slide.title} style={[s.slide, { width }]}>
            <SlideArt slide={slide} />
            <Text style={s.slideTitle}>{t(slide.title)}</Text>
            <Text style={s.slideText}>{t(slide.text)}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={s.footer}>
        <View style={s.dotsRow}>
          {SLIDES.map((slide, i) => (
            <View key={slide.title} style={[s.pageDot, i === index && { width: 26, backgroundColor: SLIDES[index].accent }]} />
          ))}
        </View>
        <TouchableOpacity
          style={[s.nextBtn, { backgroundColor: SLIDES[index].accent }]}
          onPress={() => (last ? onDone() : go(index + 1))}
          activeOpacity={0.85}
          accessibilityLabel={last ? t('Get Started') : t('Next')}
        >
          <Text style={s.nextText}>{last ? t('Get Started') : t('Next')}</Text>
          <Ionicons name="arrow-forward" size={20} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

export function LanguageScreen({ onDone, onBack }) {
  const s = useStyles(makeStyles);
  const { lang, setLang, t } = useT();
  const [choice, setChoice] = useState(lang);
  return (
    <Screen scroll={false} footer={<Button label={t('Continue')} onPress={() => { setLang(choice); onDone(); }} />}>
      {onBack ? <Header onBack={onBack} circle={false} /> : null}
      <Text style={s.centerTitle}>{t('Choose Your Language')}</Text>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <OptionCard selected={choice === 'en'} onPress={() => setChoice('en')} title="English" text="Default language" />
        <OptionCard selected={choice === 'hi'} onPress={() => setChoice('hi')} title="हिंदी (Hindi)" text="स्थानीय भाषा" />
      </View>
    </Screen>
  );
}

export function RoleScreen({ onRider, onBrand, onBack }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  const [role, setRole] = useState('RIDER');
  return (
    <Screen scroll={false} footer={<Button label={t('Next Step')} onPress={() => (role === 'RIDER' ? onRider() : onBrand())} />}>
      {onBack ? (
        <TouchableOpacity onPress={onBack} style={{ paddingTop: 16 }} hitSlop={10} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={26} color={colors.text} />
        </TouchableOpacity>
      ) : null}
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={s.bigTitle}>{t('How would you like to use FlexRiders?')}</Text>
        <Text style={s.bigSub}>{t('Select your profile type to proceed with registration.')}</Text>
        <OptionCard
          selected={role === 'RIDER'}
          onPress={() => setRole('RIDER')}
          icon="bicycle-outline"
          title={t('Continue as Rider')}
          text={t('Ride daily, carry brand campaigns and earn for every approved day.')}
        />
        <OptionCard
          selected={role === 'BRAND'}
          onPress={() => setRole('BRAND')}
          icon="megaphone-outline"
          title={t('Continue as Brand')}
          text={t('Launch hyper-local campaigns with verified riders.')}
        />
      </View>
    </Screen>
  );
}

/** Explains why location is needed before the OS prompt (shown once after sign-up). */
export function LocationPrompt({ onAllow, onSkip, onBack, busy }) {
  const s = useStyles(makeStyles);
  const { colors } = useTheme();
  const { t } = useT();
  return (
    <Screen
      scroll={false}
      footer={
        <View style={{ gap: 14 }}>
          <Button label={t('Allow Location')} onPress={onAllow} loading={busy} />
          <TouchableOpacity onPress={onSkip} style={{ alignItems: 'center', paddingVertical: 6 }}>
            <Text style={s.notNow}>{t('Not Now')}</Text>
          </TouchableOpacity>
        </View>
      }
    >
      {onBack ? <Header onBack={onBack} circle={false} /> : null}
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={s.pinHalo}>
          <View style={s.pin}>
            <Ionicons name="location-outline" size={44} color="#FFFFFF" />
          </View>
        </View>
        <Text style={[s.bigTitle, { textAlign: 'center', marginTop: 32 }]}>{t('Enable Location Access')}</Text>
        <Text style={[s.bigSub, { textAlign: 'center' }]}>
          FlexRiders uses your location while the app is open to show campaigns near you, and while you record a campaign
          route so your ride can be verified. It is not tracked in the background otherwise.
        </Text>
        <View style={[s.note, { borderColor: colors.border }]}>
          <Ionicons name="shield-checkmark-outline" size={16} color={colors.primary} />
          <Text style={s.noteText}>You can change this any time in your phone's Settings.</Text>
        </View>
      </View>
    </Screen>
  );
}

const makeStyles = (c) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: c.background },
    topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 24, paddingTop: 14, minHeight: 58 },
    backBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, alignItems: 'center', justifyContent: 'center' },
    skip: { color: c.textMuted, fontSize: 16, fontWeight: '700' },
    slide: { paddingHorizontal: 24, paddingTop: 8, flex: 1, alignItems: 'center', justifyContent: 'center' },
    art: { width: '100%', height: 330, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 32, overflow: 'hidden' },
    ring: { position: 'absolute', width: 300, height: 300, borderRadius: 150, borderWidth: 2 },
    ringInner: { width: 220, height: 220, borderRadius: 110 },
    heroCard: { width: '80%', height: '66%', backgroundColor: '#FFFFFF', borderRadius: 26, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
    hero: { width: '94%', height: '94%' },
    medal: { width: 150, height: 150, borderRadius: 75, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center', shadowOpacity: 0.25, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8 },
    chip: { position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
    chipText: { fontSize: 13, fontWeight: '700', color: c.text },
    slideTitle: { fontSize: 27, fontWeight: '800', color: c.text, lineHeight: 34, letterSpacing: -0.3, textAlign: 'center', maxWidth: 340 },
    slideText: { fontSize: 16, color: c.textMuted, marginTop: 12, lineHeight: 24, textAlign: 'center', maxWidth: 330 },
    footer: { alignItems: 'center', gap: 18, paddingHorizontal: 24, paddingBottom: 28, paddingTop: 12 },
    dotsRow: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
    pageDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.border },
    nextBtn: { height: 56, alignSelf: 'stretch', borderRadius: 28, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
    nextText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
    centerTitle: { fontSize: 20, fontWeight: '700', color: c.text, textAlign: 'center', marginTop: 24 },
    bigTitle: { fontSize: 28, fontWeight: '800', color: c.text, lineHeight: 34 },
    bigSub: { fontSize: 16, color: c.textMuted, marginTop: 10, marginBottom: 28, lineHeight: 22 },
    notNow: { color: c.textMuted, fontSize: 16, fontWeight: '700' },
    pinHalo: { width: 170, height: 170, borderRadius: 85, backgroundColor: c.primarySoft, alignItems: 'center', justifyContent: 'center' },
    pin: { width: 110, height: 110, borderRadius: 55, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' },
    note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 12, padding: 10, marginTop: -10 },
    noteText: { fontSize: 12, color: c.textMuted },
  });
