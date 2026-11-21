import {
    TabList,
    TabListProps,
    Tabs,
    TabSlot,
    TabTrigger,
    TabTriggerSlotProps,
} from 'expo-router/ui';
import { Pressable, PressableProps, StyleSheet, useWindowDimensions, View } from 'react-native';

import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

export default function AppTabs() {
  const { width } = useWindowDimensions();
  const desktop = width >= 760;

  return (
    <Tabs>
      <TabSlot style={desktop ? styles.desktopSlot : styles.mobileSlot} />
      <TabList asChild>
        <CustomTabList desktop={desktop}>
          <TabTrigger name="index" href="/" asChild>
            <TabButton>Calls</TabButton>
          </TabTrigger>
          <TabTrigger name="chats" href="/chats" asChild>
            <TabButton>Chats</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const { ref, ...pressableProps } = props;
  void ref;
  return (
    <Pressable {...(pressableProps as PressableProps)} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView
        type={isFocused ? 'backgroundSelected' : 'backgroundElement'}
        style={styles.tabButtonView}>
        <ThemedText type="small" themeColor={isFocused ? 'text' : 'textSecondary'}>
          {children}
        </ThemedText>
      </ThemedView>
    </Pressable>
  );
}

export function CustomTabList({ desktop, ...props }: TabListProps & { desktop: boolean }) {
  return (
    <View {...props} style={[styles.tabListContainer, desktop ? styles.desktopTabList : styles.mobileTabList]}>
      <ThemedView type="backgroundElement" style={[styles.innerContainer, desktop ? styles.desktopInnerContainer : styles.mobileInnerContainer]}>
        <ThemedText type="smallBold" style={styles.brandText}>Relay</ThemedText>
        {props.children}
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: { position: 'absolute', zIndex: 2 },
  mobileTabList: {
    width: '100%',
    bottom: 0,
    padding: Spacing.two,
    justifyContent: 'center',
    alignItems: 'center',
  },
  desktopTabList: {
    top: 0,
    bottom: 0,
    left: 0,
    width: 220,
    padding: Spacing.three,
    justifyContent: 'flex-start',
    alignItems: 'stretch',
  },
  mobileSlot: { height: '100%', marginBottom: 64 },
  desktopSlot: { height: '100%', marginLeft: 220 },
  innerContainer: { paddingVertical: Spacing.two, paddingHorizontal: Spacing.five, flexGrow: 1, gap: Spacing.two },
  mobileInnerContainer: {
    borderRadius: Spacing.five,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: MaxContentWidth,
  },
  desktopInnerContainer: {
    borderRadius: Spacing.two,
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: Spacing.four,
  },
  brandText: { marginRight: 'auto', marginBottom: 16 },
  pressed: { opacity: 0.7 },
  tabButtonView: { minHeight: 40, paddingVertical: Spacing.two, paddingHorizontal: Spacing.three, borderRadius: Spacing.two },
});