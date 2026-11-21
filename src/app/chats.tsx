import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useOnlineAgents } from '@/hooks/use-online-agents';
import { apiRequest, type ChatMessage, type ConversationSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const blue = '#168FD0';
const dark = '#34424B';
const muted = '#7E8A92';
const border = '#DDE3E7';

export default function ChatsScreen() {
  const { user, token, signOut } = useAuth();
  const { agents, loading: agentsLoading, error: agentsError } = useOnlineAgents();
  const { width } = useWindowDimensions();
  const wide = width >= 760;
  const [message, setMessage] = useState('');
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest<ConversationSummary[]>('/api/conversations', {}, token);
        if (!active) return;
        setConversations(result);
        setActiveId((current) => current && result.some((item) => item.id === current) ? current : current || result[0]?.id || '');
        setError('');
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load conversations.');
      } finally {
        if (active) setLoadingConversations(false);
      }
    };
    void refresh();
    const interval = setInterval(refresh, 5_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (!token || !activeId) {
      setMessages([]);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest<ChatMessage[]>(`/api/conversations/${activeId}/messages`, {}, token);
        if (active) setMessages(result);
      } catch (requestError) {
        if (active) setError(requestError instanceof Error ? requestError.message : 'Unable to load messages.');
      }
    };
    void refresh();
    const interval = setInterval(refresh, 3_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [activeId, token]);

  async function startConversation(agentId: string) {
    if (!token) return;
    try {
      const conversation = await apiRequest<ConversationSummary>('/api/conversations', {
        method: 'POST',
        body: JSON.stringify({ userId: agentId }),
      }, token);
      setConversations((current) => [conversation, ...current.filter((item) => item.id !== conversation.id)]);
      setActiveId(conversation.id);
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to start a conversation.');
    }
  }

  async function sendMessage() {
    const text = message.trim();
    if (!token || !activeId || !text || sending) return;
    setSending(true);
    try {
      const saved = await apiRequest<ChatMessage>(`/api/conversations/${activeId}/messages`, {
        method: 'POST',
        body: JSON.stringify({ text }),
      }, token);
      setMessages((current) => [...current, saved]);
      setMessage('');
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Message could not be sent.');
    } finally {
      setSending(false);
    }
  }

  const selected = conversations.find((conversation) => conversation.id === activeId);
  const otherParticipant = selected?.participants.find((participant) => (participant.id ?? participant._id) !== user?.id);
  const showSidebar = wide || !activeId;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.brandIcon}><Text style={styles.brandIconText}>A</Text></View>
        <Text style={styles.headerTitle}>Chats</Text>
        <Text numberOfLines={1} style={styles.userName}>{user?.displayName}</Text>
        <Pressable accessibilityRole="button" onPress={() => { void signOut(); }} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={[styles.body, wide && styles.bodyWide]}>
        {showSidebar && (
          <ScrollView style={[styles.sidebar, wide && styles.sidebarWide]} contentContainerStyle={styles.sidebarContent}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Agents</Text>
              <Text style={styles.sectionCount}>{agents.filter((agent) => agent.online).length} online</Text>
            </View>
            {agentsLoading && agents.length === 0 ? <Text style={styles.hint}>Checking availability…</Text> : null}
            {!agentsLoading && agents.length === 0 ? <Text style={styles.hint}>No agent accounts are registered yet.</Text> : null}
            {agents.map((agent) => (
              <Pressable key={agent.id} onPress={() => { void startConversation(agent.id); }} style={styles.agentRow}>
                <View style={agent.online ? styles.onlineDot : styles.offlineDot} />
                <Text numberOfLines={1} style={styles.rowName}>{agent.displayName}</Text>
                <Text style={agent.online ? styles.agentOnlineText : styles.agentOfflineText}>{agent.online ? 'Online' : 'Offline'}</Text>
                <Text style={styles.startLabel}>Message</Text>
              </Pressable>
            ))}
            {!!agentsError && <Text style={styles.errorText}>{agentsError}</Text>}

            <View style={[styles.sectionHeading, styles.conversationHeading]}>
              <Text style={styles.sectionTitle}>Conversations</Text>
              <Text style={styles.sectionCount}>{conversations.length}</Text>
            </View>
            {loadingConversations && conversations.length === 0 ? <Text style={styles.hint}>Loading conversations…</Text> : null}
            {!loadingConversations && conversations.length === 0 ? <Text style={styles.hint}>Your saved conversations will appear here.</Text> : null}
            {conversations.map((conversation) => {
              const participant = conversation.participants.find((item) => (item.id ?? item._id) !== user?.id);
              return (
                <Pressable key={conversation.id} onPress={() => setActiveId(conversation.id)} style={[styles.conversationRow, activeId === conversation.id && styles.conversationActive]}>
                  <Text numberOfLines={1} style={styles.rowName}>{participant?.displayName ?? 'Conversation'}</Text>
                  <Text numberOfLines={1} style={styles.preview}>{conversation.lastMessageText || 'No messages yet'}</Text>
                </Pressable>
              );
            })}
            {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
          </ScrollView>
        )}

        {activeId ? (
          <View style={styles.thread}>
            <View style={styles.threadHeader}>
              {!wide && <Pressable onPress={() => setActiveId('')} style={styles.backButton}><Text style={styles.backText}>Back</Text></Pressable>}
              <Text numberOfLines={1} style={styles.threadTitle}>{otherParticipant?.displayName ?? 'Conversation'}</Text>
            </View>
            <ScrollView
              contentContainerStyle={styles.messageList}>
              {messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptyText}>Send a message to start the conversation.</Text>
                </View>
              ) : messages.map((item) => {
                const ownMessage = item.senderId === user?.id;
                return (
                  <View key={item.id} style={[styles.messageRow, ownMessage && styles.ownMessageRow]}>
                    <View style={[styles.bubble, ownMessage ? styles.ownBubble : styles.otherBubble]}>
                      {!ownMessage && <Text style={styles.senderName}>{item.senderName}</Text>}
                      <Text style={[styles.messageText, ownMessage && styles.ownMessageText]}>{item.text}</Text>
                      <Text style={[styles.timestamp, ownMessage && styles.ownTimestamp]}>{new Date(item.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
            {!!error && <Text accessibilityRole="alert" style={styles.composerError}>{error}</Text>}
            <View style={styles.composer}>
              <TextInput
                accessibilityLabel="Message"
                onChangeText={setMessage}
                onSubmitEditing={() => { void sendMessage(); }}
                placeholder="Write a message"
                placeholderTextColor="#A2ABB1"
                style={styles.input}
                value={message}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send message"
                disabled={!message.trim() || sending}
                onPress={() => { void sendMessage(); }}
                style={[styles.sendButton, (!message.trim() || sending) && styles.sendButtonDisabled]}>
                <Text style={styles.sendText}>{sending ? 'Sending' : 'Send'}</Text>
              </Pressable>
            </View>
          </View>
        ) : wide ? (
          <View style={styles.noSelection}>
            <Text style={styles.emptyTitle}>Select a conversation</Text>
            <Text style={styles.emptyText}>Choose an agent or open a saved conversation.</Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F8' },
  header: { height: 56, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: border, gap: 10 },
  brandIcon: { width: 30, height: 30, borderRadius: 6, backgroundColor: blue, alignItems: 'center', justifyContent: 'center' },
  brandIconText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: dark, flex: 1, fontSize: 15, fontWeight: '600' },
  userName: { maxWidth: 125, color: muted, fontSize: 12 },
  signOutButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 8 },
  signOutText: { color: blue, fontSize: 12, fontWeight: '600' },
  body: { flex: 1 },
  bodyWide: { flexDirection: 'row' },
  sidebar: { flex: 1, backgroundColor: '#FFFFFF' },
  sidebarWide: { flex: 0, width: 310, borderRightWidth: 1, borderRightColor: border },
  sidebarContent: { padding: 14, gap: 5 },
  sectionHeading: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
  sectionTitle: { color: dark, fontSize: 13, fontWeight: '700' },
  sectionCount: { color: muted, fontSize: 12 },
  conversationHeading: { marginTop: 18, borderTopWidth: 1, borderTopColor: border, paddingTop: 8 },
  hint: { color: muted, fontSize: 12, paddingVertical: 8 },
  agentRow: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8, borderRadius: 5, backgroundColor: '#F8FAFB' },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2D9D65' },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#A8B0B5' },
  rowName: { flex: 1, color: dark, fontSize: 13 },
  agentOnlineText: { color: '#247A4C', fontSize: 10, fontWeight: '600' },
  agentOfflineText: { color: muted, fontSize: 10 },
  startLabel: { color: blue, fontSize: 11, fontWeight: '600' },
  conversationRow: { minHeight: 54, justifyContent: 'center', gap: 3, paddingHorizontal: 9, borderRadius: 5 },
  conversationActive: { backgroundColor: '#EAF5FB' },
  preview: { color: muted, fontSize: 11 },
  errorText: { color: '#B42318', fontSize: 12, paddingVertical: 5 },
  thread: { flex: 1, minHeight: 0, backgroundColor: '#F8FAFB' },
  threadHeader: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: border },
  threadTitle: { flex: 1, color: dark, fontSize: 14, fontWeight: '600' },
  backButton: { minHeight: 36, justifyContent: 'center', paddingRight: 6 },
  backText: { color: blue, fontSize: 13, fontWeight: '600' },
  messageList: { flexGrow: 1, justifyContent: 'flex-end', padding: 14, gap: 9 },
  messageRow: { flexDirection: 'row', justifyContent: 'flex-start' },
  ownMessageRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', minWidth: 80, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8 },
  ownBubble: { backgroundColor: blue },
  otherBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border },
  senderName: { color: blue, fontSize: 10, fontWeight: '700', marginBottom: 3 },
  messageText: { color: dark, fontSize: 13, lineHeight: 19 },
  ownMessageText: { color: '#FFFFFF' },
  timestamp: { color: muted, fontSize: 9, textAlign: 'right', marginTop: 4 },
  ownTimestamp: { color: '#D8F0FC' },
  emptyState: { alignItems: 'center', gap: 8, padding: 24 },
  emptyTitle: { color: dark, fontSize: 16, fontWeight: '600' },
  emptyText: { maxWidth: 300, color: muted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  noSelection: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  composerError: { color: '#B42318', fontSize: 12, paddingHorizontal: 14, paddingTop: 6, backgroundColor: '#FFFFFF' },
  composer: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: border },
  input: { flex: 1, height: 42, borderWidth: 1, borderColor: border, borderRadius: 6, paddingHorizontal: 13, color: dark, backgroundColor: '#FAFBFB' },
  sendButton: { height: 42, minWidth: 64, borderRadius: 6, backgroundColor: blue, alignItems: 'center', justifyContent: 'center' },
  sendButtonDisabled: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
