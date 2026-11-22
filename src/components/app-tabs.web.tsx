import { useEffect, useRef } from 'react';
import {
    TabList,
    TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
} from 'expo-router/ui';
import { Animated, Easing, Pressable, PressableProps, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useChatNotifications } from '@/lib/chat-notifications';

// ── Tab icons as emoji/text glyphs ──────────────────────────────────────────
const TAB_META: Record<string, { icon: string; color: string }> = {
  Calls:  { icon: '☎', color: '#168FD0' },
  Chats:  { icon: '💬', color: '#25D366' },
};

// ── Animated entrance for the whole sidebar ──────────────────────────────────
function useSidebarEntrance() {
  const translateX = useRef(new Animated.Value(-40)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateX, { toValue: 0, duration: 460, useNativeDriver: true, easing: Easing.out(Easing.cubic) }),
      Animated.timing(opacity,    { toValue: 1, duration: 400, useNativeDriver: true, easing: Easing.out(Easing.quad) }),
    ]).start();
  }, [opacity, translateX]);
  return { translateX, opacity };
}

// ── Mobile bottom bar entrance ───────────────────────────────────────────────
function useMobileEntrance() {
  const translateY = useRef(new Animated.Value(60)).current;
  const opacity    = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 160, delay: 100 }),
      Animated.timing(opacity,    { toValue: 1, duration: 350, useNativeDriver: true, delay: 100 }),
    ]).start();
  }, [opacity, translateY]);
  return { translateY, opacity };
}

export default function AppTabs() {
  const { width } = useWindowDimensions();
  const insets    = useSafeAreaInsets();
  const desktop   = width >= 760;
  const { unreadCount } = useChatNotifications();

  return (
    <Tabs>
      <TabSlot style={desktop
        ? styles.desktopSlot
        : [styles.mobileSlot, { paddingBottom: 72 + insets.bottom }]}
      />
      <TabList asChild>
        <CustomTabList desktop={desktop} bottomInset={insets.bottom}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton label="Calls" />
          </TabTrigger>
          <TabTrigger name="chats" href="/chats" asChild>
            <TabButton label="Chats" badge={unreadCount} />
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

// ── Individual tab button ─────────────────────────────────────────────────────
export function TabButton({ label, isFocused, badge, ...props }:
  TabTriggerSlotProps & { label: string; badge?: number }) {
  const { ref, ...pressableProps } = props;
  void ref;

  const meta       = TAB_META[label] ?? { icon: '•', color: '#168FD0' };
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const bgAnim     = useRef(new Animated.Value(isFocused ? 1 : 0)).current;

  // Animate background when focus changes
  useEffect(() => {
    Animated.timing(bgAnim, {
      toValue: isFocused ? 1 : 0,
      duration: 220,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [isFocused, bgAnim]);

  const bgColor = bgAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.10)'],
  });
  const borderColor = bgAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: ['rgba(255,255,255,0)', 'rgba(255,255,255,0.18)'],
  });
  const leftBarScale = bgAnim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, 1],
  });

  function handlePressIn()  { Animated.spring(scaleAnim, { toValue: 0.96, useNativeDriver: true, speed: 50 }).start(); }
  function handlePressOut() { Animated.spring(scaleAnim, { toValue: 1,    useNativeDriver: true, speed: 50 }).start(); }

  return (
    <Pressable
      {...(pressableProps as PressableProps)}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}>
      <Animated.View style={[styles.tabBtn, { transform: [{ scale: scaleAnim }] }]}>
        {/* Active left indicator bar */}
        <Animated.View style={[styles.activeBar, { backgroundColor: meta.color, transform: [{ scaleY: leftBarScale }] }]} />

        <Animated.View style={[styles.tabBtnInner, { backgroundColor: bgColor, borderColor }]}>
          {/* Icon */}
          <View style={[styles.iconWrap, isFocused && { backgroundColor: meta.color + '28' }]}>
            <Text style={[styles.tabIcon, { color: isFocused ? meta.color : 'rgba(255,255,255,0.45)' }]}>
              {meta.icon}
            </Text>
          </View>

          {/* Label */}
          <Text style={[styles.tabLabel, { color: isFocused ? '#FFFFFF' : 'rgba(255,255,255,0.5)' }]}>
            {label}
          </Text>

          {/* Unread badge */}
          {Boolean(badge && badge > 0) && (
            <View style={[styles.badge, { backgroundColor: meta.color }]}>
              <Text style={styles.badgeText}>{badge}</Text>
            </View>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// ── Sidebar / tab list container ──────────────────────────────────────────────
export function CustomTabList({ desktop, bottomInset, ...props }:
  TabListProps & { desktop: boolean; bottomInset: number }) {

  if (desktop) {
    const { translateX, opacity } = useSidebarEntrance(); // eslint-disable-line react-hooks/rules-of-hooks
    return (
      <Animated.View
        {...(props as object)}
        style={[styles.sidebarWrap, { opacity, transform: [{ translateX }] }]}>
        {/* Gradient header */}
        <View style={styles.sidebarHeader}>
          <View style={styles.logoMark}>
            <Text style={styles.logoMarkText}>R</Text>
          </View>
          <View>
            <Text style={styles.brandName}>RELAY</Text>
            <Text style={styles.brandTagline}>Agent Workspace</Text>
          </View>
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Nav items */}
        <View style={styles.navItems}>
          {props.children}
        </View>

        {/* Bottom status pill */}
        <View style={styles.sidebarFooter}>
          <View style={styles.onlineDot} />
          <Text style={styles.footerText}>Connected</Text>
        </View>
      </Animated.View>
    );
  }

  // ── Mobile bottom bar ───────────────────────────────────────────────────────
  const { translateY, opacity } = useMobileEntrance(); // eslint-disable-line react-hooks/rules-of-hooks
  return (
    <Animated.View
      style={[styles.mobileWrap, { bottom: bottomInset + Spacing.two, opacity, transform: [{ translateY }] }]}>
      <View {...(props as object)} style={styles.mobilePill}>
        <Text style={styles.mobileBrand}>Relay</Text>
        <View style={styles.mobileNav}>
          {props.children}
        </View>
      </View>
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // Slots
  mobileSlot:  { flex: 1 },
  desktopSlot: { height: '100%', marginLeft: 240 },

  // ── Desktop sidebar ────────────────────────────────────────────────────────
  sidebarWrap: {
    position:        'absolute',
    top:             0,
    left:            0,
    bottom:          0,
    width:           240,
    backgroundColor: '#0E1628',
    paddingVertical: 24,
    paddingHorizontal: 16,
    zIndex:          10,
    // Web shadow
    shadowColor:     '#000',
    shadowOffset:    { width: 4, height: 0 },
    shadowOpacity:   0.35,
    shadowRadius:    20,
    elevation:       12,
    gap:             4,
  },
  sidebarHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            12,
    paddingBottom:  12,
  },
  logoMark: {
    width:           38,
    height:          38,
    borderRadius:    12,
    backgroundColor: '#168FD0',
    alignItems:      'center',
    justifyContent:  'center',
  },
  logoMarkText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  brandName:    { color: '#FFFFFF', fontSize: 15, fontWeight: '800', letterSpacing: 1.5 },
  brandTagline: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 1 },

  divider: {
    height:          1,
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginVertical:  12,
    marginHorizontal: -4,
  },

  navItems: { gap: 4, flex: 1 },

  // Tab button
  tabBtn:      { position: 'relative' },
  activeBar: {
    position:     'absolute',
    left:         -16,
    top:          8,
    bottom:       8,
    width:        3,
    borderRadius: 2,
  },
  tabBtnInner: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             10,
    paddingVertical:  10,
    paddingHorizontal: 12,
    borderRadius:    10,
    borderWidth:     1,
  },
  iconWrap: {
    width:          32,
    height:         32,
    borderRadius:   8,
    alignItems:     'center',
    justifyContent: 'center',
  },
  tabIcon:  { fontSize: 16 },
  tabLabel: { flex: 1, fontSize: 13, fontWeight: '600' },

  badge: {
    minWidth:        20,
    height:          20,
    borderRadius:    10,
    paddingHorizontal: 5,
    alignItems:      'center',
    justifyContent:  'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },

  sidebarFooter: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             7,
    paddingTop:      14,
    borderTopWidth:  1,
    borderTopColor:  'rgba(255,255,255,0.07)',
    paddingHorizontal: 4,
  },
  onlineDot: {
    width:           7,
    height:          7,
    borderRadius:    4,
    backgroundColor: '#25D366',
  },
  footerText: { color: 'rgba(255,255,255,0.4)', fontSize: 11 },

  // ── Mobile bottom pill ─────────────────────────────────────────────────────
  mobileWrap: {
    position: 'absolute',
    left:     0,
    right:    0,
    zIndex:   10,
    padding:  Spacing.two,
    alignItems: 'center',
  },
  mobilePill: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#0E1628',
    borderRadius:    40,
    paddingVertical:  10,
    paddingHorizontal: 20,
    gap:             16,
    maxWidth:        MaxContentWidth,
    shadowColor:     '#000',
    shadowOffset:    { width: 0, height: 6 },
    shadowOpacity:   0.3,
    shadowRadius:    16,
    elevation:       10,
  },
  mobileBrand: {
    color:      '#FFFFFF',
    fontSize:   13,
    fontWeight: '800',
    marginRight: 'auto',
    letterSpacing: 1,
  },
  mobileNav: { flexDirection: 'row', gap: 6 },
});