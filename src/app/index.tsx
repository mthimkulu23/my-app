import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const blue = '#168FD0';
const dark = '#34424B';
const muted = '#7E8A92';
const border = '#DDE3E7';
const digits = [
  ['1', ''], ['2', 'ABC'], ['3', 'DEF'],
  ['4', 'GHI'], ['5', 'JKL'], ['6', 'MNO'],
  ['7', 'PQRS'], ['8', 'TUV'], ['9', 'WXYZ'],
  ['*', ''], ['0', '+'], ['#', ''],
];

type WorkspaceTab = 'CRM' | 'Queues' | 'Agents';

export default function HomeScreen() {
  const [number, setNumber] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('CRM');
  const [queueMenuOpen, setQueueMenuOpen] = useState(false);
  const [calling, setCalling] = useState(false);
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [softphone, setSoftphone] = useState(true);

  function workspaceContent() {
    if (workspaceTab === 'Queues') {
      return (
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>Voice queues</Text>
          <Text style={styles.infoLine}>OtherInquiries_Queue</Text>
          <Text style={styles.infoMeta}>1 queue available</Text>
        </View>
      );
    }
    if (workspaceTab === 'Agents') {
      return (
        <View style={styles.infoContent}>
          <Text style={styles.infoTitle}>Agents</Text>
          <Text style={styles.infoLine}>HK · You</Text>
          <Text style={styles.infoMeta}>2 agents signed in</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyCrm}>
        <Text style={styles.emptyCrmText}>No CRM page available</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.brandIcon}><Text style={styles.brandIconText}>A</Text></View>
        <Text style={styles.headerTitle}>Agent panel</Text>
        <View style={styles.agentBadge}><Text style={styles.agentInitials}>HK</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.queueHeader}>
          <View style={styles.queueHeadingRow}>
            <Text style={styles.queueHeading}>Voice Queues</Text>
            <Text style={styles.loggedIn}>(Logged in: 1)</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose voice queue"
            onPress={() => setQueueMenuOpen((open) => !open)}
            style={styles.queueSelect}>
            <Text numberOfLines={1} style={styles.queueName}>OtherInquiries_Queue</Text>
            <Text style={styles.chevron}>⌄</Text>
          </Pressable>
          {queueMenuOpen && (
            <Pressable onPress={() => setQueueMenuOpen(false)} style={styles.queueOption}>
              <Text style={styles.queueName}>OtherInquiries_Queue</Text>
              <Text style={styles.checkmark}>✓</Text>
            </Pressable>
          )}
        </View>

        <View style={styles.workspaceTabs}>
          {(['CRM', 'Queues', 'Agents'] as WorkspaceTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setWorkspaceTab(tab)}
              style={[styles.workspaceTab, workspaceTab === tab && styles.workspaceTabActive]}>
              <Text style={[styles.workspaceTabText, workspaceTab === tab && styles.workspaceTabTextActive]}>
                {tab}{tab === 'Queues' ? ' (1)' : tab === 'Agents' ? ' (2)' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.workspacePanel}>{workspaceContent()}</View>

        <View style={styles.phonePanel}>
          <View style={styles.phoneTabs}>
            <View style={styles.phoneTab}><Text style={styles.phoneTabText}>Calls (0)</Text></View>
            <View style={[styles.phoneTab, styles.phoneTabActive]}><Text style={styles.phoneTabTextActive}>Phone</Text></View>
          </View>
          <View style={styles.phoneTools}>
            <Pressable accessibilityLabel="Contacts" style={styles.toolButton}><Text style={styles.toolGlyph}>◉</Text></Pressable>
            <Pressable accessibilityLabel="Call information" style={styles.toolButton}><Text style={styles.toolGlyph}>ⓘ</Text></Pressable>
            <Pressable accessibilityLabel="Headset" style={styles.toolButton}><Text style={styles.toolGlyph}>♧</Text></Pressable>
          </View>

          {calling ? (
            <View style={styles.activeCall}>
              <Text style={styles.activeCallStatus}>Calling</Text>
              <Text style={styles.activeCallNumber}>{number || 'Enter a number'}</Text>
              <Pressable onPress={() => setCalling(false)} style={styles.endCallButton}>
                <Text style={styles.endCallText}>End call</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.numberEntry}>
                <TextInput
                  accessibilityLabel="Phone number"
                  value={number}
                  onChangeText={setNumber}
                  placeholder="Enter number or drag-in people"
                  placeholderTextColor="#B7BEC3"
                  keyboardType="phone-pad"
                  style={styles.numberInput}
                  textAlign="center"
                />
                {number.length > 0 && (
                  <Pressable accessibilityLabel="Delete last digit" onPress={() => setNumber((value) => value.slice(0, -1))}>
                    <Text style={styles.deleteGlyph}>⌫</Text>
                  </Pressable>
                )}
              </View>
              <View style={styles.keypad}>
                {digits.map(([digit, letters]) => (
                  <Pressable
                    key={digit}
                    accessibilityLabel={`Dial ${digit}`}
                    onPress={() => setNumber((value) => value + digit)}
                    style={({ pressed }) => [styles.digitKey, pressed && styles.digitKeyPressed]}>
                    <Text style={styles.digitText}>{digit}</Text>
                    {letters ? <Text style={styles.digitLetters}>{letters}</Text> : null}
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Start call"
                onPress={() => setCalling(true)}
                style={styles.callButton}>
                <Text style={styles.callGlyph}>☎</Text>
              </Pressable>
            </>
          )}

          <View style={styles.phoneFooter}>
            <Pressable onPress={() => setNumber('')} style={styles.footerButton}>
              <Text style={styles.footerText}>ACCESS CODES</Text>
            </Pressable>
            <Pressable onPress={() => setDoNotDisturb((enabled) => !enabled)} style={styles.footerButton}>
              <Text style={[styles.footerText, doNotDisturb && styles.footerTextActive]}>{doNotDisturb ? 'DND ON' : 'DND'}</Text>
            </Pressable>
            <Pressable onPress={() => setSoftphone((enabled) => !enabled)} style={styles.footerButton}>
              <Text style={[styles.footerText, softphone && styles.footerTextActive]}>{softphone ? 'SOFTPHONE' : 'OFFLINE'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F8' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: border, gap: 10 },
  brandIcon: { width: 30, height: 30, borderRadius: 6, backgroundColor: blue, alignItems: 'center', justifyContent: 'center' },
  brandIconText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: dark, flex: 1, fontSize: 15, fontWeight: '600' },
  agentBadge: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F5F6', borderRadius: 5 },
  agentInitials: { color: dark, fontSize: 12, fontWeight: '600' },
  content: { padding: 14, gap: 12, paddingBottom: 22 },
  queueHeader: { zIndex: 2 },
  queueHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  queueHeading: { color: blue, fontSize: 13, fontWeight: '500' },
  loggedIn: { color: blue, fontSize: 12 },
  queueSelect: { minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, borderRadius: 4 },
  queueName: { flex: 1, color: '#505D66', fontSize: 12 },
  chevron: { color: muted, fontSize: 17, paddingLeft: 8 },
  queueOption: { height: 40, marginTop: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border },
  checkmark: { color: blue, fontSize: 15 },
  workspaceTabs: { flexDirection: 'row', gap: 4 },
  workspaceTab: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: blue, borderRadius: 20 },
  workspaceTabActive: { backgroundColor: blue },
  workspaceTabText: { color: blue, fontSize: 12 },
  workspaceTabTextActive: { color: '#FFFFFF' },
  workspacePanel: { minHeight: 112, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, borderRadius: 8, overflow: 'hidden' },
  emptyCrm: { flex: 1, minHeight: 110, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F7F7' },
  emptyCrmText: { color: '#727F88', fontSize: 14 },
  infoContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, gap: 6 },
  infoTitle: { color: dark, fontSize: 14, fontWeight: '600' },
  infoLine: { color: '#52616A', fontSize: 12 },
  infoMeta: { color: muted, fontSize: 11 },
  phonePanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, borderRadius: 8, overflow: 'hidden' },
  phoneTabs: { height: 38, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: border },
  phoneTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phoneTabActive: { backgroundColor: blue },
  phoneTabText: { color: '#48565E', fontSize: 12 },
  phoneTabTextActive: { color: '#FFFFFF', fontSize: 12 },
  phoneTools: { height: 34, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 16, gap: 8 },
  toolButton: { width: 23, height: 28, alignItems: 'center', justifyContent: 'center' },
  toolGlyph: { color: '#54B4E5', fontSize: 18 },
  numberEntry: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14 },
  numberInput: { flex: 1, color: dark, fontSize: 14, paddingVertical: 8 },
  deleteGlyph: { color: muted, fontSize: 19, paddingHorizontal: 8 },
  keypad: { width: 216, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 8, columnGap: 10, marginTop: 2 },
  digitKey: { width: 62, height: 51, borderRadius: 28, borderWidth: 1, borderColor: '#D5DADD', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  digitKeyPressed: { backgroundColor: '#EFF8FC' },
  digitText: { color: blue, fontSize: 16, lineHeight: 19 },
  digitLetters: { color: '#89939A', fontSize: 7, lineHeight: 9 },
  callButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 15, marginBottom: 13, backgroundColor: '#56B52B' },
  callGlyph: { color: '#FFFFFF', fontSize: 27, lineHeight: 32, transform: [{ rotate: '-35deg' }] },
  phoneFooter: { minHeight: 34, borderTopWidth: 1, borderTopColor: '#F0F1F2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 11 },
  footerButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 5 },
  footerText: { color: '#747F86', fontSize: 8 },
  footerTextActive: { color: blue },
  activeCall: { minHeight: 270, alignItems: 'center', justifyContent: 'center', gap: 10 },
  activeCallStatus: { color: muted, fontSize: 13 },
  activeCallNumber: { color: dark, fontSize: 21, fontWeight: '500' },
  endCallButton: { width: 120, height: 44, marginTop: 20, borderRadius: 24, backgroundColor: '#D9514B', alignItems: 'center', justifyContent: 'center' },
  endCallText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
});