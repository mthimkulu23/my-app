import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type CallEntry = {
  id: string;
  name: string;
  initials: string;
  color: string;
  detail: string;
  missed: boolean;
};

const calls: CallEntry[] = [
  { id: 'mara', name: 'Mara Chen', initials: 'MC', color: '#D5E8DD', detail: 'Today, 10:12 AM · 8 min', missed: false },
  { id: 'leo', name: 'Leo Park', initials: 'LP', color: '#F3D9C9', detail: 'Today, 9:32 AM · 8 min', missed: false },
  { id: 'imani', name: 'Imani Brooks', initials: 'IB', color: '#E8DDF3', detail: 'Yesterday, 6:48 PM · Missed', missed: true },
  { id: 'noah', name: 'Noah Williams', initials: 'NW', color: '#F0E7C7', detail: 'Monday, 2:05 PM · 3 min', missed: false },
];

const colors = {
  ink: '#202622',
  muted: '#848C85',
  line: '#E8EBE7',
  paper: '#FBFCFA',
  green: '#2D7655',
  pale: '#E8F1EB',
};

export default function CallsScreen() {
  const [filter, setFilter] = useState<'All' | 'Missed'>('All');
  const [calling, setCalling] = useState<CallEntry | null>(null);
  const shownCalls = calls.filter((entry) => filter === 'All' || entry.missed);

  if (calling) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.callScreen}>
          <Pressable onPress={() => setCalling(null)} style={styles.backButton}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
          <View style={styles.callerBlock}>
            <View style={[styles.avatarLarge, { backgroundColor: calling.color }]}>
              <Text style={styles.avatarLargeText}>{calling.initials}</Text>
            </View>
            <Text style={styles.callerName}>{calling.name}</Text>
            <Text style={styles.callStatus}>Calling…</Text>
          </View>
          <View style={styles.callActions}>
            <Pressable style={styles.callAction}>
              <Text style={styles.actionIcon}>◖</Text>
              <Text style={styles.actionLabel}>Mute</Text>
            </Pressable>
            <Pressable onPress={() => setCalling(null)} style={styles.endCall}>
              <Text style={styles.endCallText}>×</Text>
            </Pressable>
            <Pressable onPress={() => setCalling(null)} style={styles.callAction}>
              <Text style={styles.actionIcon}>▣</Text>
              <Text style={styles.actionLabel}>Speaker</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark}><Text style={styles.brandMarkText}>r</Text></View>
          <Text style={styles.brandName}>relay</Text>
        </View>
        <Text style={styles.eyebrow}>HEAR A FAMILIAR VOICE</Text>
        <Text style={styles.title}>Calls</Text>
        <Text style={styles.subtitle}>One tap away from catching up.</Text>

        <View style={styles.filterBar}>
          {(['All', 'Missed'] as const).map((value) => (
            <Pressable
              key={value}
              onPress={() => setFilter(value)}
              style={[styles.filterButton, filter === value && styles.filterButtonActive]}>
              <Text style={[styles.filterText, filter === value && styles.filterTextActive]}>{value}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.callList}>
          {shownCalls.map((entry, index) => (
            <View key={entry.id} style={[styles.callRow, index < shownCalls.length - 1 && styles.divider]}>
              <View style={[styles.avatar, { backgroundColor: entry.color }]}>
                <Text style={styles.avatarText}>{entry.initials}</Text>
              </View>
              <View style={styles.callCopy}>
                <Text style={[styles.name, entry.missed && styles.missedName]}>{entry.name}</Text>
                <Text style={[styles.detail, entry.missed && styles.missedDetail]}>{entry.detail}</Text>
              </View>
              <Pressable
                accessibilityLabel={`Call ${entry.name}`}
                onPress={() => setCalling(entry)}
                style={styles.callButton}>
                <Text style={styles.callButtonGlyph}>↗</Text>
              </Pressable>
            </View>
          ))}
          {shownCalls.length === 0 && <Text style={styles.emptyState}>No missed calls.</Text>}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { flexGrow: 1, paddingBottom: 30 },
  brandRow: { height: 58, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' },
  brandMarkText: { color: '#FFFFFF', fontSize: 21, fontWeight: '700', lineHeight: 25 },
  brandName: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  eyebrow: { color: colors.green, marginHorizontal: 24, marginTop: 21, fontSize: 10, fontWeight: '700', letterSpacing: 1.4 },
  title: { color: colors.ink, marginHorizontal: 24, marginTop: 7, fontSize: 34, fontWeight: '600', fontFamily: 'Georgia' },
  subtitle: { color: colors.muted, marginHorizontal: 24, marginTop: 5, fontSize: 14 },
  filterBar: { alignSelf: 'flex-start', marginHorizontal: 24, marginTop: 28, padding: 3, borderRadius: 12, flexDirection: 'row', backgroundColor: '#F0F2EF' },
  filterButton: { minWidth: 76, alignItems: 'center', paddingHorizontal: 13, paddingVertical: 8, borderRadius: 9 },
  filterButtonActive: { backgroundColor: '#FFFFFF' },
  filterText: { color: colors.muted, fontSize: 12, fontWeight: '500' },
  filterTextActive: { color: colors.ink, fontWeight: '600' },
  callList: { marginTop: 14, paddingHorizontal: 24 },
  callRow: { minHeight: 82, flexDirection: 'row', alignItems: 'center', gap: 13 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.line },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#46554A', fontSize: 15, fontWeight: '600' },
  callCopy: { flex: 1, gap: 6 },
  name: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  missedName: { color: '#B54E45' },
  detail: { color: colors.muted, fontSize: 11 },
  missedDetail: { color: '#B54E45' },
  callButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.pale, alignItems: 'center', justifyContent: 'center' },
  callButtonGlyph: { color: colors.green, fontSize: 20, fontWeight: '600' },
  emptyState: { textAlign: 'center', color: colors.muted, paddingVertical: 32, fontSize: 14 },
  callScreen: { flex: 1, justifyContent: 'space-between', padding: 26, backgroundColor: colors.pale },
  backButton: { width: 40, height: 44, justifyContent: 'center' },
  backGlyph: { color: colors.green, fontSize: 38, fontWeight: '300' },
  callerBlock: { alignItems: 'center', gap: 12, marginTop: -35 },
  avatarLarge: { width: 112, height: 112, borderRadius: 56, alignItems: 'center', justifyContent: 'center' },
  avatarLargeText: { color: '#46554A', fontSize: 29, fontWeight: '600' },
  callerName: { color: colors.ink, fontSize: 28, fontFamily: 'Georgia' },
  callStatus: { color: colors.muted, fontSize: 14 },
  callActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 24 },
  callAction: { alignItems: 'center', gap: 8 },
  actionIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: '#FFFFFF', color: colors.ink, textAlign: 'center', textAlignVertical: 'center', overflow: 'hidden', fontSize: 20, paddingTop: 15 },
  actionLabel: { color: '#59645C', fontSize: 11 },
  endCall: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#C74C45', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '135deg' }] },
  endCallText: { color: '#FFFFFF', fontSize: 36, lineHeight: 40, fontWeight: '300' },
});