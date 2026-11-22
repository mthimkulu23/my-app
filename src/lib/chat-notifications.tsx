import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import { apiRequest, markConversationRead, type ConversationSummary } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export type PopupNotification = {
  conversationId: string;
  senderName: string;
  channel: 'internal' | 'whatsapp';
  preview: string;
  timestamp: string;
};

type ChatNotificationContextType = {
  unreadCount: number;
  conversations: ConversationSummary[];
  selectedConversationId: string;
  setSelectedConversationId: (id: string) => void;
  markRead: (conversationId: string) => Promise<void>;
  refreshConversations: () => Promise<void>;
  activeNotification: PopupNotification | null;
  dismissNotification: () => void;
};

const ChatNotificationContext = createContext<ChatNotificationContextType | null>(null);

function playNotificationChime() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(200);
    return;
  }
  const webAudio = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = webAudio.AudioContext ?? webAudio.webkitAudioContext;
  if (!AudioContextConstructor) return;

  try {
    const ctx = new AudioContextConstructor();
    void ctx.resume();
    const now = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, now); // D5
    osc1.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880, now + 0.09); // A5
    osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.18); // D6

    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start(now);
    osc1.stop(now + 0.12);
    osc2.start(now + 0.09);
    osc2.stop(now + 0.38);
  } catch {}
}

export function ChatNotificationProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const insets = useSafeAreaInsets();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState('');
  const [activeNotification, setActiveNotification] = useState<PopupNotification | null>(null);
  const knownMessagesRef = useRef<Map<string, string>>(new Map());
  const initialLoadRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const unreadCount = conversations.reduce((total, conv) => total + (conv.unread ? 1 : 0), 0);

  const dismissNotification = () => {
    setActiveNotification(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  const showPopup = (notification: PopupNotification) => {
    setActiveNotification(notification);
    playNotificationChime();
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setActiveNotification(null);
    }, 6000);
  };

  const markRead = async (conversationId: string) => {
    if (!token || !conversationId) return;
    setConversations((current) =>
      current.map((c) => (c.id === conversationId ? { ...c, unread: false, unreadCount: 0 } : c))
    );
    try {
      await markConversationRead(conversationId, token);
    } catch {}
  };

  const refreshConversations = async () => {
    if (!token) return;
    try {
      const result = await apiRequest<ConversationSummary[]>('/api/conversations', {}, token);
      setConversations(result);

      // Check for incoming new messages to trigger popup
      for (const conv of result) {
        const lastMsgTime = conv.lastMessageAt || '';
        const prevMsgTime = knownMessagesRef.current.get(conv.id);

        if (!initialLoadRef.current && lastMsgTime && lastMsgTime !== prevMsgTime && conv.unread) {
          const senderName =
            conv.channel === 'whatsapp'
              ? conv.contactName || conv.contactAddress || 'WhatsApp Customer'
              : conv.lastSenderName ||
                conv.participants.find((p) => (p.id ?? p._id) !== user?.id)?.displayName ||
                'Agent';

          showPopup({
            conversationId: conv.id,
            senderName,
            channel: conv.channel,
            preview: conv.lastMessageText || 'Sent a new message',
            timestamp: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }),
          });
        }
        knownMessagesRef.current.set(conv.id, lastMsgTime);
      }

      if (initialLoadRef.current) {
        initialLoadRef.current = false;
      }
    } catch {}
  };

  useEffect(() => {
    if (!token) {
      setConversations([]);
      knownMessagesRef.current.clear();
      initialLoadRef.current = true;
      return;
    }
    void refreshConversations();
    const interval = setInterval(() => {
      void refreshConversations();
    }, 3500);
    return () => clearInterval(interval);
  }, [token]);

  const handleNotificationPress = () => {
    if (!activeNotification) return;
    const targetId = activeNotification.conversationId;
    dismissNotification();
    setSelectedConversationId(targetId);
    void markRead(targetId);
    try {
      router.push('/chats');
    } catch {}
  };

  return (
    <ChatNotificationContext.Provider
      value={{
        unreadCount,
        conversations,
        selectedConversationId,
        setSelectedConversationId,
        markRead,
        refreshConversations,
        activeNotification,
        dismissNotification,
      }}>
      {children}

      {/* Floating Popup Notification Banner */}
      {activeNotification && (
        <View style={[styles.popupContainer, { top: insets.top + 8 }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open new message"
            onPress={handleNotificationPress}
            style={styles.popupCard}>
            <View
              style={[
                styles.popupIconBadge,
                activeNotification.channel === 'whatsapp' ? styles.whatsappBadge : styles.internalBadge,
              ]}>
              <Text style={styles.popupIconText}>
                {activeNotification.channel === 'whatsapp' ? 'WA' : 'AG'}
              </Text>
            </View>

            <View style={styles.popupContent}>
              <View style={styles.popupHeaderRow}>
                <Text numberOfLines={1} style={styles.popupSender}>
                  {activeNotification.senderName}
                </Text>
                <View
                  style={[
                    styles.tagPill,
                    activeNotification.channel === 'whatsapp' ? styles.waTagPill : styles.internalTagPill,
                  ]}>
                  <Text style={styles.tagPillText}>
                    {activeNotification.channel === 'whatsapp' ? 'WhatsApp' : 'Agent'}
                  </Text>
                </View>
                <Text style={styles.popupTime}>{activeNotification.timestamp}</Text>
              </View>

              <Text numberOfLines={2} style={styles.popupText}>
                {activeNotification.preview}
              </Text>

              <View style={styles.popupActionRow}>
                <View style={styles.oneMessageBadge}>
                  <Text style={styles.oneMessageText}>1 new message</Text>
                </View>
                <Text style={styles.tapToReplyText}>Tap to open chat →</Text>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification"
              onPress={dismissNotification}
              style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </Pressable>
        </View>
      )}
    </ChatNotificationContext.Provider>
  );
}

export function useChatNotifications() {
  const context = useContext(ChatNotificationContext);
  if (!context) {
    throw new Error('useChatNotifications must be used within a ChatNotificationProvider');
  }
  return context;
}

const styles = StyleSheet.create({
  popupContainer: {
    position: 'absolute',
    left: 12,
    right: 12,
    alignItems: 'center',
    zIndex: 99999,
  },
  popupCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: '#D4E2EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 8,
  },
  popupIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  whatsappBadge: {
    backgroundColor: '#25D366',
  },
  internalBadge: {
    backgroundColor: '#168FD0',
  },
  popupIconText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  popupContent: {
    flex: 1,
    gap: 4,
  },
  popupHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  popupSender: {
    flex: 1,
    color: '#202E38',
    fontSize: 13,
    fontWeight: '700',
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  waTagPill: {
    backgroundColor: '#E8F9EE',
  },
  internalTagPill: {
    backgroundColor: '#EBF5FB',
  },
  tagPillText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#1B8246',
  },
  popupTime: {
    color: '#8A969F',
    fontSize: 10,
  },
  popupText: {
    color: '#495863',
    fontSize: 12,
    lineHeight: 17,
  },
  popupActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  oneMessageBadge: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  oneMessageText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  tapToReplyText: {
    color: '#168FD0',
    fontSize: 11,
    fontWeight: '600',
  },
  closeBtn: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#F0F3F5',
  },
  closeText: {
    color: '#7E8A92',
    fontSize: 11,
    fontWeight: '700',
  },
});
