import { useEffect, useRef, useState } from 'react';
import {
  Image,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { AudioModule, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';

import { useOnlineAgents } from '@/hooks/use-online-agents';
import {
  apiRequest,
  deleteChatMessage,
  deleteConversationThread,
  editChatMessage,
  getAssetUrl,
  uploadAttachment,
  type ChatMessage,
  type ConversationSummary,
  type MessageAttachment,
} from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useChatNotifications } from '@/lib/chat-notifications';

const blue = '#168FD0';
const dark = '#34424B';
const muted = '#7E8A92';
const border = '#DDE3E7';

const EMOJIS = [
  '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇',
  '🙂', '😉', '😌', '😍', '🥰', '😘', '😋', '😛', '😜', '🤪',
  '😎', '🤓', '🧐', '🥳', '😏', '😒', '😞', '😔', '😟', '😕',
  '🙁', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠',
  '😡', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰', '🤔', '🤗',
  '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😴', '😷',
  '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤙', '👏', '🙌', '🙏',
  '🤝', '💪', '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '💯', '🔥', '✨', '⭐', '🎉', '🎁', '⚡', '🚀', '📞', '💬',
];

type SelectedFile = {
  fileName: string;
  fileType: string;
  fileSize: number;
  data: string;
};

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function pickFileWeb(): Promise<SelectedFile | null> {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve(null);
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '*/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => {
        const result = String(reader.result || '');
        resolve({
          fileName: file.name,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
          data: result,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

function VoiceNotePlayer({ url, isOwn }: { url: string; isOwn: boolean }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (typeof Audio === 'undefined') return;
    const audio = new Audio(url);
    audioRef.current = audio;

    const handleLoaded = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(Math.round(audio.duration));
      }
    };
    const handleTime = () => {
      setCurrentTime(Math.round(audio.currentTime));
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('loadedmetadata', handleLoaded);
    audio.addEventListener('timeupdate', handleTime);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', handleLoaded);
      audio.removeEventListener('timeupdate', handleTime);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [url]);

  const togglePlay = () => {
    if (!audioRef.current) {
      if (Platform.OS !== 'web') {
        void Linking.openURL(url);
      }
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const formatSecs = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const remaining = Math.floor(sec % 60);
    return `${mins}:${remaining < 10 ? '0' : ''}${remaining}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const waveformHeights = [40, 70, 30, 90, 60, 100, 45, 80, 55, 95, 35, 75, 50, 85, 65, 30, 90, 45, 70, 40];

  return (
    <View style={[styles.voicePlayerCard, isOwn ? styles.ownVoiceCard : styles.otherVoiceCard]}>
      <Pressable onPress={togglePlay} style={[styles.playBtn, isOwn ? styles.ownPlayBtn : styles.otherPlayBtn]}>
        <Text style={[styles.playBtnText, isOwn ? styles.ownPlayBtnText : styles.otherPlayBtnText]}>
          {isPlaying ? '⏸' : '▶'}
        </Text>
      </Pressable>

      <View style={styles.voiceProgressCol}>
        <View style={styles.waveformContainer}>
          {waveformHeights.map((h, i) => {
            const barProgress = (i / waveformHeights.length) * 100;
            const isFilled = barProgress <= progress;
            return (
              <View
                key={i}
                style={[
                  styles.waveformBar,
                  { height: (h / 100) * 18 + 4 },
                  isOwn
                    ? isFilled ? styles.ownWaveFilled : styles.ownWaveEmpty
                    : isFilled ? styles.otherWaveFilled : styles.otherWaveEmpty,
                ]}
              />
            );
          })}
        </View>
        <View style={styles.voiceTimeRow}>
          <Text style={[styles.voiceTimeText, isOwn && styles.ownVoiceTime]}>
            {formatSecs(currentTime)} / {duration > 0 ? formatSecs(duration) : '0:00'}
          </Text>
          <Text style={[styles.voiceLabel, isOwn && styles.ownVoiceTime]}>🎙️ Voice note</Text>
        </View>
      </View>
    </View>
  );
}

export default function ChatsScreen() {
  const { user, token, signOut } = useAuth();
  const { agents, loading: agentsLoading, error: agentsError } = useOnlineAgents();
  const {
    selectedConversationId,
    setSelectedConversationId,
    markRead,
    conversations,
    refreshConversations,
  } = useChatNotifications();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width >= 760;

  const [message, setMessage] = useState('');
  const [selectedAttachment, setSelectedAttachment] = useState<SelectedFile | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // Edit & Delete state
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [deletingConversation, setDeletingConversation] = useState(false);

  // Voice note recording state
  const [recordingVoice, setRecordingVoice] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const nativeRecorderRef = useRef<any>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [activeId, setActiveId] = useState(selectedConversationId || '');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (selectedConversationId && selectedConversationId !== activeId) {
      setActiveId(selectedConversationId);
    }
  }, [selectedConversationId]);

  useEffect(() => {
    if (wide && !activeId && conversations.length > 0) {
      setActiveId(conversations[0]?.id || '');
    }
  }, [conversations, activeId, wide]);

  useEffect(() => {
    if (activeId && token) {
      void markRead(activeId);
    }
  }, [activeId, token]);

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
      const conversation = await apiRequest<ConversationSummary>(
        '/api/conversations',
        {
          method: 'POST',
          body: JSON.stringify({ userId: agentId }),
        },
        token
      );
      setSelectedConversationId(conversation.id);
      setActiveId(conversation.id);
      void refreshConversations();
      setError('');
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to start a conversation.');
    }
  }

  async function handlePickAttachment() {
    try {
      const file = await pickFileWeb();
      if (file) {
        setSelectedAttachment(file);
        setShowEmojiPicker(false);
        setEditingMessageId(null);
      }
    } catch (pickerError) {
      setError(pickerError instanceof Error ? pickerError.message : 'Could not pick file.');
    }
  }

  async function startVoiceRecording() {
    try {
      if (Platform.OS !== 'web') {
        const permission = await requestRecordingPermissionsAsync();
        if (!permission.granted) {
          setError('Microphone permission was denied. Please allow microphone access in your phone settings.');
          return;
        }
        const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
        nativeRecorderRef.current = recorder;
        recorder.record();
        setRecordingVoice(true);
        setRecordingDuration(0);
        setShowEmojiPicker(false);
        setEditingMessageId(null);
        setError('');

        if (recordTimerRef.current) clearInterval(recordTimerRef.current);
        recordTimerRef.current = setInterval(() => {
          setRecordingDuration((prev) => prev + 1);
        }, 1000);
        return;
      }

      if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        setError('Voice recording is not supported in this browser.');
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      recorder.start(100);
      setRecordingVoice(true);
      setRecordingDuration(0);
      setShowEmojiPicker(false);
      setEditingMessageId(null);
      setError('');

      if (recordTimerRef.current) clearInterval(recordTimerRef.current);
      recordTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: unknown) {
      const errorObj = err as { name?: string; message?: string };
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.isSecureContext === false) {
        setError('Microphone requires HTTPS or localhost. Browsers block microphone access over plain HTTP IP addresses.');
      } else if (errorObj?.name === 'NotAllowedError' || errorObj?.name === 'PermissionDeniedError') {
        setError('Microphone permission was denied. Click the lock/tune icon in your browser address bar to allow microphone access.');
      } else if (errorObj?.name === 'NotFoundError' || errorObj?.name === 'DevicesNotFoundError') {
        setError('No microphone found. Please plug in a microphone or headset.');
      } else {
        setError(errorObj?.message || 'Microphone permission denied or audio device not found.');
      }
    }
  }

  function cancelVoiceRecording() {
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);
    if (nativeRecorderRef.current) {
      try {
        void nativeRecorderRef.current.stop();
      } catch {}
      nativeRecorderRef.current = null;
    }
    if (mediaRecorderRef.current) {
      try {
        mediaRecorderRef.current.stream?.getTracks().forEach((track) => track.stop());
        mediaRecorderRef.current.stop();
      } catch {}
      mediaRecorderRef.current = null;
    }
    setRecordingVoice(false);
    setRecordingDuration(0);
    audioChunksRef.current = [];
  }

  async function stopAndSendVoiceRecording() {
    if ((!mediaRecorderRef.current && !nativeRecorderRef.current) || !token || !activeId) return;
    if (recordTimerRef.current) clearInterval(recordTimerRef.current);

    if (Platform.OS !== 'web' && nativeRecorderRef.current) {
      const recorder = nativeRecorderRef.current;
      nativeRecorderRef.current = null;
      try {
        await recorder.stop();
        const uri = recorder.uri;
        if (!uri) {
          setRecordingVoice(false);
          return;
        }
        setSending(true);
        setUploadingAttachment(true);
        const fileResponse = await fetch(uri);
        const blob = await fileResponse.blob();
        const reader = new FileReader();
        reader.onload = async () => {
          try {
            const base64 = String(reader.result || '');
            const uploaded = await uploadAttachment(
              {
                fileName: `voice_${Date.now()}.m4a`,
                fileType: 'audio/m4a',
                data: base64,
              },
              token
            );
            const saved = await apiRequest<ChatMessage>(
              `/api/conversations/${activeId}/messages`,
              {
                method: 'POST',
                body: JSON.stringify({
                  text: '',
                  attachment: uploaded,
                }),
              },
              token
            );
            setMessages((current) => [...current, saved]);
            void refreshConversations();
          } catch (sendErr) {
            setError(sendErr instanceof Error ? sendErr.message : 'Could not send voice note.');
          } finally {
            setSending(false);
            setUploadingAttachment(false);
            setRecordingVoice(false);
            setRecordingDuration(0);
          }
        };
        reader.onerror = () => {
          setSending(false);
          setUploadingAttachment(false);
          setRecordingVoice(false);
        };
        reader.readAsDataURL(blob);
      } catch (recErr) {
        setError(recErr instanceof Error ? recErr.message : 'Failed to save recording.');
        setSending(false);
        setUploadingAttachment(false);
        setRecordingVoice(false);
        setRecordingDuration(0);
      }
      return;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    mediaRecorderRef.current = null;
    recorder.onstop = () => {
      try {
        recorder.stream?.getTracks().forEach((track) => track.stop());
      } catch {}
      const mimeType = recorder.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
      if (audioBlob.size === 0) {
        setRecordingVoice(false);
        return;
      }

      setSending(true);
      setUploadingAttachment(true);
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = String(reader.result || '');
          const ext = mimeType.includes('ogg') ? '.ogg' : mimeType.includes('mp4') ? '.mp4' : '.webm';
          const uploaded = await uploadAttachment(
            {
              fileName: `voice_${Date.now()}${ext}`,
              fileType: mimeType,
              data: base64,
            },
            token
          );

          const saved = await apiRequest<ChatMessage>(
            `/api/conversations/${activeId}/messages`,
            {
              method: 'POST',
              body: JSON.stringify({
                text: '',
                attachment: uploaded,
              }),
            },
            token
          );

          setMessages((current) => [...current, saved]);
          void refreshConversations();
        } catch (sendErr) {
          setError(sendErr instanceof Error ? sendErr.message : 'Could not send voice note.');
        } finally {
          setSending(false);
          setUploadingAttachment(false);
          setRecordingVoice(false);
          setRecordingDuration(0);
          audioChunksRef.current = [];
        }
      };
      reader.onerror = () => {
        setSending(false);
        setUploadingAttachment(false);
        setRecordingVoice(false);
      };
      reader.readAsDataURL(audioBlob);
    };

    try {
      recorder.stop();
    } catch {
      setRecordingVoice(false);
    }
  }

  function handleStartEdit(item: ChatMessage) {
    setEditingMessageId(item.id);
    setMessage(item.text);
    setSelectedAttachment(null);
    setShowEmojiPicker(false);
  }

  function handleCancelEdit() {
    setEditingMessageId(null);
    setMessage('');
  }

  async function handleSaveEdit() {
    const text = message.trim();
    if (!token || !activeId || !editingMessageId || !text || sending) return;
    setSending(true);
    setError('');
    try {
      const updated = await editChatMessage(activeId, editingMessageId, text, token);
      setMessages((current) =>
        current.map((msg) =>
          msg.id === editingMessageId
            ? { ...msg, text: updated.text, isEdited: true, editedAt: updated.editedAt }
            : msg
        )
      );
      setEditingMessageId(null);
      setMessage('');
      void refreshConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not edit message.');
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!token || !activeId || deletingMessageId) return;
    if (typeof window !== 'undefined' && !window.confirm('Delete this message for everyone?')) {
      return;
    }
    setDeletingMessageId(messageId);
    try {
      await deleteChatMessage(activeId, messageId, token);
      setMessages((current) =>
        current.map((msg) =>
          msg.id === messageId
            ? { ...msg, isDeleted: true, text: 'This message was deleted', attachment: null }
            : msg
        )
      );
      void refreshConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete message.');
    } finally {
      setDeletingMessageId(null);
    }
  }

  async function handleDeleteConversation() {
    if (!token || !activeId || deletingConversation) return;
    if (typeof window !== 'undefined' && !window.confirm('Are you sure you want to delete this entire chat conversation?')) {
      return;
    }
    setDeletingConversation(true);
    try {
      await deleteConversationThread(activeId, token);
      setActiveId('');
      setSelectedConversationId('');
      setMessages([]);
      void refreshConversations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete conversation.');
    } finally {
      setDeletingConversation(false);
    }
  }

  async function sendMessage() {
    if (editingMessageId) {
      await handleSaveEdit();
      return;
    }

    const text = message.trim();
    if (!token || !activeId || (!text && !selectedAttachment) || sending) return;
    setSending(true);
    setError('');
    try {
      let uploaded: MessageAttachment | null = null;
      if (selectedAttachment) {
        setUploadingAttachment(true);
        uploaded = await uploadAttachment(
          {
            fileName: selectedAttachment.fileName,
            fileType: selectedAttachment.fileType,
            data: selectedAttachment.data,
          },
          token
        );
      }

      const saved = await apiRequest<ChatMessage>(
        `/api/conversations/${activeId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            text,
            attachment: uploaded,
          }),
        },
        token
      );

      setMessages((current) => [...current, saved]);
      setMessage('');
      setSelectedAttachment(null);
      setShowEmojiPicker(false);
      setError('');
      void refreshConversations();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Message could not be sent.');
    } finally {
      setSending(false);
      setUploadingAttachment(false);
    }
  }

  const selected = conversations.find((conversation) => conversation.id === activeId);
  const otherParticipant = selected?.participants.find((participant) => (participant.id ?? participant._id) !== user?.id);
  const showSidebar = wide || !activeId;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        {!wide && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to Calls"
            onPress={() => router.push('/')}
            style={styles.headerBackButton}>
            <Text style={styles.headerBackText}>← Calls</Text>
          </Pressable>
        )}
        <View style={styles.brandIcon}>
          <Text style={styles.brandIconText}>A</Text>
        </View>
        <Text style={styles.headerTitle}>Chats</Text>
        <Text numberOfLines={1} style={styles.userName}>
          {user?.displayName}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => { void signOut(); }} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <View style={[styles.body, wide && styles.bodyWide, !wide && { paddingBottom: 72 + insets.bottom }]}>
        {showSidebar && (
          <ScrollView style={[styles.sidebar, wide && styles.sidebarWide]} contentContainerStyle={styles.sidebarContent}>
            <View style={styles.sectionHeading}>
              <Text style={styles.sectionTitle}>Agents</Text>
              <Text style={styles.sectionCount}>
                {agents.filter((agent) => agent.online).length} online
              </Text>
            </View>
            {agentsLoading && agents.length === 0 ? <Text style={styles.hint}>Checking availability…</Text> : null}
            {!agentsLoading && agents.length === 0 ? <Text style={styles.hint}>No agent accounts are registered yet.</Text> : null}
            {agents.map((agent) => (
              <Pressable key={agent.id} onPress={() => { void startConversation(agent.id); }} style={styles.agentRow}>
                <View style={agent.online ? styles.onlineDot : styles.offlineDot} />
                <Text numberOfLines={1} style={styles.rowName}>
                  {agent.displayName}
                </Text>
                <Text style={agent.online ? styles.agentOnlineText : styles.agentOfflineText}>
                  {agent.online ? 'Online' : 'Offline'}
                </Text>
                <Text style={styles.startLabel}>Message</Text>
              </Pressable>
            ))}
            {!!agentsError && <Text style={styles.errorText}>{agentsError}</Text>}

            <View style={[styles.sectionHeading, styles.conversationHeading]}>
              <Text style={styles.sectionTitle}>Conversations</Text>
              <Text style={styles.sectionCount}>{conversations.length}</Text>
            </View>
            {conversations.length === 0 ? <Text style={styles.hint}>Your saved conversations will appear here.</Text> : null}
            {conversations.map((conversation) => {
              const participant = conversation.participants.find((item) => (item.id ?? item._id) !== user?.id);
              const isWhatsApp = conversation.channel === 'whatsapp';
              const conversationName = isWhatsApp
                ? conversation.contactName || conversation.contactAddress || 'WhatsApp customer'
                : participant?.displayName ?? 'Conversation';
              const isUnread = Boolean(conversation.unread);
              return (
                <Pressable
                  key={conversation.id}
                  onPress={() => {
                    setActiveId(conversation.id);
                    setSelectedConversationId(conversation.id);
                    void markRead(conversation.id);
                  }}
                  style={[
                    styles.conversationRow,
                    activeId === conversation.id && styles.conversationActive,
                    isUnread && styles.conversationUnread,
                  ]}>
                  <View style={styles.conversationTitleRow}>
                    <Text numberOfLines={1} style={[styles.rowName, isUnread && styles.rowNameUnread]}>
                      {conversationName}
                    </Text>
                    {isWhatsApp && <Text style={styles.channelTag}>WhatsApp</Text>}
                    {isUnread && (
                      <View style={styles.unreadBadge}>
                        <Text style={styles.unreadBadgeText}>
                          {conversation.unreadCount && conversation.unreadCount > 1
                            ? conversation.unreadCount
                            : '1'}
                        </Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.previewRow}>
                    <Text numberOfLines={1} style={[styles.preview, isUnread && styles.previewUnread]}>
                      {conversation.lastMessageText || 'No messages yet'}
                    </Text>
                    {isUnread && <Text style={styles.unreadLabel}>1 new message</Text>}
                  </View>
                </Pressable>
              );
            })}
            {!!error && <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text>}
          </ScrollView>
        )}

        {activeId ? (
          <View style={styles.thread}>
            <View style={styles.threadHeader}>
              {!wide && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to conversation list"
                  onPress={() => {
                    setActiveId('');
                    setSelectedConversationId('');
                  }}
                  style={styles.backButton}>
                  <Text style={styles.backText}>← Back</Text>
                </Pressable>
              )}
              <View style={styles.threadHeading}>
                <Text numberOfLines={1} style={styles.threadTitle}>
                  {selected?.channel === 'whatsapp'
                    ? selected.contactName || selected.contactAddress || 'WhatsApp customer'
                    : otherParticipant?.displayName ?? 'Conversation'}
                </Text>
                <Text style={styles.threadSubtitle}>
                  {selected?.channel === 'whatsapp'
                    ? `WhatsApp Business${selected.contactAddress ? ` · ${selected.contactAddress}` : ''}`
                    : 'Relay Internal Agent Chat'}
                </Text>
              </View>

              {/* Delete Entire Chat Thread */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete entire chat"
                disabled={deletingConversation}
                onPress={() => { void handleDeleteConversation(); }}
                style={styles.deleteChatBtn}>
                <Text style={styles.deleteChatBtnText}>
                  {deletingConversation ? 'Deleting…' : '🗑️ Delete Chat'}
                </Text>
              </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.messageList}>
              {messages.length === 0 ? (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No messages yet</Text>
                  <Text style={styles.emptyText}>
                    {selected?.channel === 'whatsapp'
                      ? 'Inbound messages and voice notes from WhatsApp customers will arrive here. You can reply with text, emojis, attachments, or voice notes.'
                      : 'Send a message, emoji, voice note, or share an attachment to start the conversation.'}
                  </Text>
                </View>
              ) : (
                messages.map((item) => {
                  const ownMessage = item.direction === 'outbound' || item.senderId === user?.id;
                  const isImage = item.attachment?.fileType?.startsWith('image/');
                  const isAudio =
                    item.attachment?.fileType?.startsWith('audio/') ||
                    item.attachment?.fileName?.toLowerCase().endsWith('.ogg') ||
                    item.attachment?.fileName?.toLowerCase().endsWith('.webm') ||
                    item.attachment?.fileName?.toLowerCase().endsWith('.mp3') ||
                    item.attachment?.fileName?.toLowerCase().endsWith('.m4a');
                  const hasAttachment = Boolean(item.attachment?.url);

                  return (
                    <View key={item.id} style={[styles.messageRow, ownMessage && styles.ownMessageRow]}>
                      <View
                        style={[
                          styles.bubble,
                          ownMessage ? styles.ownBubble : styles.otherBubble,
                          item.isDeleted && (ownMessage ? styles.ownBubbleDeleted : styles.otherBubbleDeleted),
                        ]}>
                        {!ownMessage && !item.isDeleted && <Text style={styles.senderName}>{item.senderName}</Text>}

                        {item.isDeleted ? (
                          <Text
                            style={[
                              styles.deletedMessageText,
                              ownMessage ? styles.ownDeletedText : styles.otherDeletedText,
                            ]}>
                            🚫 This message was deleted
                          </Text>
                        ) : (
                          <>
                            {/* Image Attachment */}
                            {hasAttachment && isImage && item.attachment && (
                              <Pressable
                                onPress={() => {
                                  const url = getAssetUrl(item.attachment!.url);
                                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                    window.open(url, '_blank');
                                  } else {
                                    void Linking.openURL(url);
                                  }
                                }}
                                style={styles.imageAttachmentContainer}>
                                <Image
                                  source={{ uri: getAssetUrl(item.attachment.url) }}
                                  style={styles.imageAttachment}
                                  resizeMode="cover"
                                />
                              </Pressable>
                            )}

                            {/* Voice Note Player */}
                            {hasAttachment && isAudio && item.attachment && (
                              <VoiceNotePlayer
                                url={getAssetUrl(item.attachment.url)}
                                isOwn={ownMessage}
                              />
                            )}

                            {/* Document/File Attachment */}
                            {hasAttachment && !isImage && !isAudio && item.attachment && (
                              <Pressable
                                onPress={() => {
                                  const url = getAssetUrl(item.attachment!.url);
                                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                    window.open(url, '_blank');
                                  } else {
                                    void Linking.openURL(url);
                                  }
                                }}
                                style={[
                                  styles.fileAttachmentCard,
                                  ownMessage ? styles.ownFileCard : styles.otherFileCard,
                                ]}>
                                <Text style={styles.fileIcon}>📄</Text>
                                <View style={styles.fileDetails}>
                                  <Text
                                    numberOfLines={1}
                                    style={[styles.fileName, ownMessage && styles.ownFileName]}>
                                    {item.attachment.fileName}
                                  </Text>
                                  <Text style={[styles.fileMeta, ownMessage && styles.ownFileMeta]}>
                                    {item.attachment.fileSize
                                      ? formatFileSize(item.attachment.fileSize)
                                      : 'Document'}{' '}
                                    · Tap to open
                                  </Text>
                                </View>
                              </Pressable>
                            )}

                            {/* Message Text */}
                            {!!item.text && (
                              <Text
                                style={[
                                  styles.messageText,
                                  ownMessage && styles.ownMessageText,
                                  hasAttachment && styles.messageWithAttachment,
                                ]}>
                                {item.text}
                              </Text>
                            )}
                          </>
                        )}

                        <View style={styles.bubbleFooter}>
                          {item.isEdited && !item.isDeleted && (
                            <Text style={[styles.editedIndicator, ownMessage && styles.ownEditedIndicator]}>
                              edited
                            </Text>
                          )}
                          <Text style={[styles.timestamp, ownMessage && styles.ownTimestamp]}>
                            {new Date(item.createdAt).toLocaleTimeString([], {
                              hour: 'numeric',
                              minute: '2-digit',
                            })}
                          </Text>
                        </View>
                      </View>

                      {/* Action buttons (Edit & Delete) for own messages */}
                      {ownMessage && !item.isDeleted && (
                        <View style={styles.msgActionRow}>
                          {Boolean(item.text && !item.attachment?.fileType?.startsWith('audio/')) && (
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel="Edit message"
                              onPress={() => handleStartEdit(item)}
                              style={styles.msgActionBtn}>
                              <Text style={styles.msgActionBtnText}>✏️</Text>
                            </Pressable>
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Delete message"
                            disabled={deletingMessageId === item.id}
                            onPress={() => { void handleDeleteMessage(item.id); }}
                            style={styles.msgActionBtn}>
                            <Text style={styles.msgActionBtnText}>🗑️</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>

            {!!error && <Text accessibilityRole="alert" style={styles.composerError}>{error}</Text>}

            {/* Selected Attachment Preview Bar */}
            {selectedAttachment && (
              <View style={styles.attachmentPreviewBar}>
                <View style={styles.attachmentPreviewBadge}>
                  <Text style={styles.attachmentPreviewIcon}>📎</Text>
                  <View style={styles.attachmentPreviewMeta}>
                    <Text numberOfLines={1} style={styles.attachmentPreviewName}>
                      {selectedAttachment.fileName}
                    </Text>
                    <Text style={styles.attachmentPreviewSize}>
                      {formatFileSize(selectedAttachment.fileSize)}
                    </Text>
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Remove attachment"
                    onPress={() => setSelectedAttachment(null)}
                    style={styles.attachmentRemoveBtn}>
                    <Text style={styles.attachmentRemoveText}>✕</Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Editing Message Banner */}
            {editingMessageId && (
              <View style={styles.editingBanner}>
                <View style={styles.editingBannerContent}>
                  <Text style={styles.editingBannerIcon}>✏️</Text>
                  <Text style={styles.editingBannerText}>Editing message</Text>
                </View>
                <Pressable onPress={handleCancelEdit} style={styles.cancelEditBtn}>
                  <Text style={styles.cancelEditText}>✕ Cancel</Text>
                </Pressable>
              </View>
            )}

            {/* Emoji Picker Popover */}
            {showEmojiPicker && (
              <View style={styles.emojiPickerContainer}>
                <View style={styles.emojiPickerHeader}>
                  <Text style={styles.emojiPickerTitle}>Emojis</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Close emoji picker"
                    onPress={() => setShowEmojiPicker(false)}
                    style={styles.emojiCloseBtn}>
                    <Text style={styles.emojiCloseText}>✕</Text>
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.emojiGrid}>
                  {EMOJIS.map((emoji, index) => (
                    <Pressable
                      key={index}
                      accessibilityRole="button"
                      onPress={() => {
                        setMessage((prev) => prev + emoji);
                      }}
                      style={styles.emojiItem}>
                      <Text style={styles.emojiChar}>{emoji}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Composer / Voice Recorder Bar */}
            {recordingVoice ? (
              <View style={styles.recordingComposer}>
                <View style={styles.recordingIndicator}>
                  <View style={styles.blinkingDot} />
                  <Text style={styles.recordingDurationText}>
                    Recording voice note... {Math.floor(recordingDuration / 60)}:
                    {(recordingDuration % 60) < 10 ? '0' : ''}
                    {recordingDuration % 60}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Cancel voice recording"
                  onPress={cancelVoiceRecording}
                  style={styles.cancelRecordBtn}>
                  <Text style={styles.cancelRecordText}>✕ Cancel</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send voice note"
                  onPress={() => { void stopAndSendVoiceRecording(); }}
                  style={styles.sendRecordBtn}>
                  <Text style={styles.sendRecordText}>➤ Send</Text>
                </Pressable>
              </View>
            ) : (
              <View style={styles.composer}>
                {/* Attachment Button */}
                {!editingMessageId && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Attach file"
                    onPress={() => { void handlePickAttachment(); }}
                    style={styles.composerIconBtn}>
                    <Text style={styles.composerIconText}>📎</Text>
                  </Pressable>
                )}

                {/* Emoji Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Pick emoji"
                  onPress={() => setShowEmojiPicker((prev) => !prev)}
                  style={[styles.composerIconBtn, showEmojiPicker && styles.composerIconBtnActive]}>
                  <Text style={styles.composerIconText}>😀</Text>
                </Pressable>

                <TextInput
                  accessibilityLabel="Message"
                  onChangeText={setMessage}
                  onSubmitEditing={() => { void sendMessage(); }}
                  placeholder={
                    editingMessageId
                      ? 'Edit your message…'
                      : selectedAttachment
                      ? 'Add a caption (optional)'
                      : 'Write a message'
                  }
                  placeholderTextColor="#A2ABB1"
                  style={styles.input}
                  value={message}
                />

                {/* Voice Note Record Button (hidden when editing) */}
                {!editingMessageId && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Record voice note"
                    onPress={() => { void startVoiceRecording(); }}
                    style={styles.micButton}>
                    <Text style={styles.micButtonText}>🎙️</Text>
                  </Pressable>
                )}

                {/* Send / Save Button */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={editingMessageId ? 'Save edit' : 'Send message'}
                  disabled={(!message.trim() && !selectedAttachment) || sending}
                  onPress={() => { void sendMessage(); }}
                  style={[
                    styles.sendButton,
                    editingMessageId && styles.saveEditButton,
                    ((!message.trim() && !selectedAttachment) || sending) && styles.sendButtonDisabled,
                  ]}>
                  <Text style={styles.sendText}>
                    {sending
                      ? (uploadingAttachment ? 'Uploading…' : 'Saving…')
                      : editingMessageId
                      ? '✓ Save'
                      : 'Send'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        ) : wide ? (
          <View style={styles.noSelection}>
            <Text style={styles.emptyTitle}>Select a conversation</Text>
            <Text style={styles.emptyText}>
              Choose an agent for internal discussion or open a WhatsApp customer query.
            </Text>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F6F7F8' },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: border,
    gap: 10,
  },
  brandIcon: {
    width: 30,
    height: 30,
    borderRadius: 6,
    backgroundColor: blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandIconText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: dark, flex: 1, fontSize: 15, fontWeight: '600' },
  headerBackButton: {
    minHeight: 36,
    justifyContent: 'center',
    paddingRight: 6,
  },
  headerBackText: {
    color: blue,
    fontSize: 13,
    fontWeight: '600',
  },
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
  agentRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    borderRadius: 5,
    backgroundColor: '#F8FAFB',
  },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#2D9D65' },
  offlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#A8B0B5' },
  rowName: { flex: 1, color: dark, fontSize: 13 },
  agentOnlineText: { color: '#247A4C', fontSize: 10, fontWeight: '600' },
  agentOfflineText: { color: muted, fontSize: 10 },
  startLabel: { color: blue, fontSize: 11, fontWeight: '600' },
  conversationRow: {
    minHeight: 56,
    justifyContent: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 6,
  },
  conversationActive: { backgroundColor: '#EAF5FB' },
  conversationUnread: { backgroundColor: '#F0F9F4' },
  conversationTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  rowNameUnread: { fontWeight: '700', color: '#1A252C' },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  preview: { flex: 1, color: muted, fontSize: 11 },
  previewUnread: { color: '#202E38', fontWeight: '600' },
  unreadBadge: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    minWidth: 19,
    height: 19,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
    marginLeft: 'auto',
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
  },
  unreadLabel: {
    color: '#1B8246',
    fontSize: 10,
    fontWeight: '700',
  },
  channelTag: {
    color: '#FFFFFF',
    backgroundColor: '#25D366',
    fontSize: 9,
    fontWeight: '700',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
  },
  errorText: { color: '#B42318', fontSize: 12, paddingVertical: 5 },
  thread: { flex: 1, minHeight: 0, backgroundColor: '#F8FAFB' },
  threadHeader: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: border,
  },
  threadHeading: { flex: 1, gap: 2 },
  threadTitle: { color: dark, fontSize: 14, fontWeight: '600' },
  threadSubtitle: { color: muted, fontSize: 10 },
  backButton: { minHeight: 36, justifyContent: 'center', paddingRight: 6 },
  backText: { color: blue, fontSize: 13, fontWeight: '600' },
  deleteChatBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  deleteChatBtnText: {
    color: '#B91C1C',
    fontSize: 11,
    fontWeight: '700',
  },
  messageList: { flexGrow: 1, justifyContent: 'flex-end', padding: 14, gap: 9 },
  messageRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, justifyContent: 'flex-start' },
  ownMessageRow: { justifyContent: 'flex-end' },
  bubble: { maxWidth: '82%', minWidth: 80, paddingHorizontal: 11, paddingVertical: 8, borderRadius: 8 },
  ownBubble: { backgroundColor: blue },
  otherBubble: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border },
  ownBubbleDeleted: { backgroundColor: '#E2E8F0', borderWidth: 1, borderColor: '#CBD5E1' },
  otherBubbleDeleted: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  deletedMessageText: { fontSize: 12, fontStyle: 'italic', lineHeight: 18 },
  ownDeletedText: { color: '#475569' },
  otherDeletedText: { color: '#64748B' },
  senderName: { color: blue, fontSize: 10, fontWeight: '700', marginBottom: 3 },
  messageText: { color: dark, fontSize: 13, lineHeight: 19 },
  ownMessageText: { color: '#FFFFFF' },
  messageWithAttachment: { marginTop: 6 },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
    marginTop: 4,
  },
  editedIndicator: {
    fontSize: 9,
    fontStyle: 'italic',
    color: muted,
  },
  ownEditedIndicator: {
    color: '#D8F0FC',
  },
  timestamp: { color: muted, fontSize: 9 },
  ownTimestamp: { color: '#D8F0FC' },

  /* Action buttons for own messages */
  msgActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginBottom: 4,
  },
  msgActionBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: border,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  msgActionBtnText: {
    fontSize: 12,
  },

  /* Image Attachment */
  imageAttachmentContainer: {
    borderRadius: 6,
    overflow: 'hidden',
    maxWidth: 260,
    maxHeight: 220,
    marginBottom: 4,
  },
  imageAttachment: {
    width: 240,
    height: 180,
    borderRadius: 6,
    backgroundColor: '#E5E9EC',
  },

  /* Document Attachment */
  fileAttachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    borderRadius: 6,
    gap: 8,
    maxWidth: 260,
    marginBottom: 4,
  },
  ownFileCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  otherFileCard: {
    backgroundColor: '#F3F6F8',
    borderWidth: 1,
    borderColor: border,
  },
  fileIcon: { fontSize: 20 },
  fileDetails: { flex: 1, gap: 2 },
  fileName: { color: dark, fontSize: 12, fontWeight: '600' },
  ownFileName: { color: '#FFFFFF' },
  fileMeta: { color: muted, fontSize: 10 },
  ownFileMeta: { color: '#D8F0FC' },

  /* Voice Note Player */
  voicePlayerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 8,
    gap: 10,
    minWidth: 220,
    maxWidth: 280,
    marginBottom: 4,
  },
  ownVoiceCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
  },
  otherVoiceCard: {
    backgroundColor: '#F3F6F8',
    borderWidth: 1,
    borderColor: border,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownPlayBtn: {
    backgroundColor: '#FFFFFF',
  },
  otherPlayBtn: {
    backgroundColor: '#25D366',
  },
  playBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
  ownPlayBtnText: {
    color: blue,
  },
  otherPlayBtnText: {
    color: '#FFFFFF',
  },
  voiceProgressCol: {
    flex: 1,
    gap: 4,
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  waveformBar: {
    flex: 1,
    borderRadius: 2,
  },
  ownWaveFilled: {
    backgroundColor: '#FFFFFF',
  },
  ownWaveEmpty: {
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  otherWaveFilled: {
    backgroundColor: '#25D366',
  },
  otherWaveEmpty: {
    backgroundColor: '#CBD5DC',
  },
  voiceTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  voiceTimeText: {
    fontSize: 10,
    color: muted,
  },
  voiceLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: muted,
  },
  ownVoiceTime: {
    color: '#E0F2FE',
  },

  emptyState: { alignItems: 'center', gap: 8, padding: 24 },
  emptyTitle: { color: dark, fontSize: 16, fontWeight: '600' },
  emptyText: { maxWidth: 300, color: muted, fontSize: 12, textAlign: 'center', lineHeight: 18 },
  noSelection: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  composerError: {
    color: '#B42318',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 6,
    backgroundColor: '#FFFFFF',
  },

  /* Editing Banner */
  editingBanner: {
    backgroundColor: '#FEF3C7',
    borderTopWidth: 1,
    borderTopColor: '#FDE68A',
    paddingHorizontal: 14,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editingBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editingBannerIcon: { fontSize: 14 },
  editingBannerText: { color: '#92400E', fontSize: 12, fontWeight: '700' },
  cancelEditBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#FDE68A',
    borderRadius: 4,
  },
  cancelEditText: { color: '#78350F', fontSize: 11, fontWeight: '700' },

  attachmentPreviewBar: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: border,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  attachmentPreviewBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EAF5FB',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#BFE0F4',
  },
  attachmentPreviewIcon: { fontSize: 16 },
  attachmentPreviewMeta: { flex: 1 },
  attachmentPreviewName: { color: dark, fontSize: 12, fontWeight: '600' },
  attachmentPreviewSize: { color: muted, fontSize: 10 },
  attachmentRemoveBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D6EBF8',
  },
  attachmentRemoveText: { color: dark, fontSize: 12, fontWeight: '700' },

  /* Emoji Picker */
  emojiPickerContainer: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: border,
    maxHeight: 180,
    padding: 10,
  },
  emojiPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3F5',
  },
  emojiPickerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: dark,
  },
  emojiCloseBtn: {
    padding: 4,
  },
  emojiCloseText: {
    fontSize: 12,
    color: muted,
    fontWeight: '700',
  },
  emojiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingTop: 8,
  },
  emojiItem: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 6,
  },
  emojiChar: {
    fontSize: 20,
  },

  /* Recording Bar */
  recordingComposer: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FEF2F2',
    borderTopWidth: 1,
    borderTopColor: '#FECACA',
  },
  recordingIndicator: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  blinkingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#DC2626',
  },
  recordingDurationText: {
    color: '#991B1B',
    fontSize: 13,
    fontWeight: '700',
  },
  cancelRecordBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    backgroundColor: '#FEE2E2',
  },
  cancelRecordText: {
    color: '#B91C1C',
    fontSize: 12,
    fontWeight: '700',
  },
  sendRecordBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    backgroundColor: '#25D366',
  },
  sendRecordText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  /* Regular Composer */
  composer: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: border,
  },
  composerIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: border,
    backgroundColor: '#FAFBFB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  composerIconBtnActive: {
    backgroundColor: '#EAF5FB',
    borderColor: blue,
  },
  composerIconText: {
    fontSize: 17,
  },
  input: {
    flex: 1,
    height: 40,
    borderWidth: 1,
    borderColor: border,
    borderRadius: 6,
    paddingHorizontal: 13,
    color: dark,
    backgroundColor: '#FAFBFB',
    fontSize: 13,
  },
  micButton: {
    width: 38,
    height: 38,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#C6E3D0',
    backgroundColor: '#F0FBF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  micButtonText: {
    fontSize: 17,
  },
  sendButton: {
    height: 40,
    minWidth: 64,
    borderRadius: 6,
    backgroundColor: blue,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  saveEditButton: {
    backgroundColor: '#D97706',
  },
  sendButtonDisabled: { opacity: 0.45 },
  sendText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600' },
});
