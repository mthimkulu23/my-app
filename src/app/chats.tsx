import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

type ChatMessage = { id: string; text: string; time: string; mine: boolean };

export default function ChatsScreen() {
  const [draft, setDraft] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'm1', text: 'Hi, are you free to talk?', time: '10:41', mine: false },
    { id: 'm2', text: 'Yes, I am. What is up?', time: '10:43', mine: true },
  ]);

  function sendMessage() {
    const text = draft.trim();
    if (!text) return;
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMessages((items) => [...items, { id: `${Date.now()}`, text, time, mine: true }]);
    setDraft('');
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.brandIcon}><Text style={styles.brandIconText}>A</Text></View>
        <Text style={styles.headerTitle}>Agent panel</Text>
        <View style={styles.agentBadge}><Text style={styles.agentInitials}>HK</Text></View>
      </View>
      <KeyboardAvoidingView style={styles.chat} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.contactHeader}>
          <View style={styles.backButton}><Text style={styles.backGlyph}>‹</Text></View>
          <View style={styles.avatar}><Text style={styles.avatarText}>SK</Text></View>
          <View style={styles.contactCopy}>
            <Text style={styles.contactName}>Sarah Kim</Text>
            <Text style={styles.contactStatus}>Available</Text>
          </View>
          <Pressable accessibilityLabel="Call Sarah" style={styles.callButton}>
            <Text style={styles.callGlyph}>☎</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.messageList} keyboardShouldPersistTaps="handled">
          <Text style={styles.dateLabel}>TODAY</Text>
          {messages.map((message) => (
            <View key={message.id} style={[styles.messageRow, message.mine && styles.myMessageRow]}>
              <View style={[styles.bubble, message.mine ? styles.myBubble : styles.theirBubble]}>
                <Text style={[styles.messageText, message.mine && styles.myMessageText]}>{message.text}</Text>
                <Text style={[styles.messageTime, message.mine && styles.myMessageTime]}>{message.time}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
        <View style={styles.composer}>
          <TextInput
            accessibilityLabel="Write a message"
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={sendMessage}
            placeholder="Enter a message"
            placeholderTextColor="#8A959D"
            returnKeyType="send"
            style={styles.input}
          />
          <Pressable accessibilityLabel="Send message" onPress={sendMessage} style={styles.sendButton}>
            <Text style={styles.sendGlyph}>↑</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F8' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#DDE3E7', gap: 10 },
  brandIcon: { width: 30, height: 30, borderRadius: 6, backgroundColor: '#168FD0', alignItems: 'center', justifyContent: 'center' },
  brandIconText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#34424B', flex: 1, fontSize: 15, fontWeight: '600' },
  agentBadge: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F5F6', borderRadius: 5 },
  agentInitials: { color: '#34424B', fontSize: 12, fontWeight: '600' },
  chat: { flex: 1 },
  contactHeader: { minHeight: 68, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#DDE3E7', gap: 11 },
  backButton: { width: 24, justifyContent: 'center' },
  backGlyph: { color: '#168FD0', fontSize: 35, fontWeight: '300' },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#D8EAF4', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#3A6B85', fontSize: 12, fontWeight: '600' },
  contactCopy: { flex: 1, gap: 3 },
  contactName: { color: '#34424B', fontSize: 14, fontWeight: '600' },
  contactStatus: { color: '#4C9C71', fontSize: 11 },
  callButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#E8F4FA', alignItems: 'center', justifyContent: 'center' },
  callGlyph: { color: '#168FD0', fontSize: 18, transform: [{ rotate: '-35deg' }] },
  messageList: { flexGrow: 1, justifyContent: 'flex-end', paddingHorizontal: 16, paddingVertical: 20, gap: 11 },
  dateLabel: { color: '#89939A', fontSize: 9, textAlign: 'center', letterSpacing: 1, marginBottom: 8 },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  myMessageRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '84%', borderRadius: 15, paddingHorizontal: 13, paddingTop: 10, paddingBottom: 6, gap: 4 },
  theirBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E3E7E9', borderBottomLeftRadius: 4 },
  myBubble: { backgroundColor: '#168FD0', borderBottomRightRadius: 4 },
  messageText: { color: '#34424B', fontSize: 14, lineHeight: 20 },
  myMessageText: { color: '#FFFFFF' },
  messageTime: { color: '#89939A', fontSize: 9, alignSelf: 'flex-end' },
  myMessageTime: { color: '#D4ECF9' },
  composer: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#DDE3E7' },
  input: { minHeight: 44, flex: 1, borderRadius: 6, borderWidth: 1, borderColor: '#DDE3E7', color: '#34424B', paddingHorizontal: 12, fontSize: 14 },
  sendButton: { width: 42, height: 42, borderRadius: 6, backgroundColor: '#168FD0', alignItems: 'center', justifyContent: 'center' },
  sendGlyph: { color: '#FFFFFF', fontSize: 24, fontWeight: '600', marginTop: -3 },
});