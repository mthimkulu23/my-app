import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, Vibration, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useOnlineAgents } from '@/hooks/use-online-agents';
import { apiRequest, type AgentShiftEntry, type CallLogEntry } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { connectVoice } from '@/lib/voice';
import type { AudioRouteType, VoiceAudioDevice, VoiceSession, VoiceStatus } from '@/lib/voice.types';

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
type PhoneCall = {
  id: string;
  destination: string;
  demo: boolean;
  demoRings?: number;
  logId?: string;
  startedAt?: number;
  status: VoiceStatus;
  muted: boolean;
  mutedBeforeHold: boolean;
  held: boolean;
  route: AudioRouteType;
  audioDevices: VoiceAudioDevice[];
  session: VoiceSession | null;
};

const dtmfFrequencies: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
  '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
  '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};

let dialToneContext: AudioContext | null = null;

function playDialTone(digit: string) {
  const frequencies = dtmfFrequencies[digit];
  if (!frequencies) return;
  if (Platform.OS !== 'web') {
    Vibration.vibrate(12);
    return;
  }

  const webAudio = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = webAudio.AudioContext ?? webAudio.webkitAudioContext;
  if (!AudioContextConstructor) return;
  dialToneContext ??= new AudioContextConstructor();
  const context = dialToneContext;
  void context.resume();

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.07, now + 0.008);
  gain.gain.setValueAtTime(0.07, now + 0.09);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
  gain.connect(context.destination);

  for (const frequency of frequencies) {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.14);
  }
}

function playDemoRingback() {
  if (Platform.OS !== 'web') {
    Vibration.vibrate(350);
    return;
  }
  const webAudio = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
  const AudioContextConstructor = webAudio.AudioContext ?? webAudio.webkitAudioContext;
  if (!AudioContextConstructor) return;
  dialToneContext ??= new AudioContextConstructor();
  const context = dialToneContext;
  void context.resume();

  const now = context.currentTime;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.055, now + 0.015);
  gain.gain.setValueAtTime(0.055, now + 0.28);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  gain.connect(context.destination);
  for (const frequency of [440, 480]) {
    const oscillator = context.createOscillator();
    oscillator.frequency.value = frequency;
    oscillator.connect(gain);
    oscillator.start(now);
    oscillator.stop(now + 0.36);
  }
}

export default function HomeScreen() {
  const { user, token, signOut } = useAuth();
  const { agents, loading: agentsLoading } = useOnlineAgents();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const compact = width < 760;
  const [number, setNumber] = useState('');
  const [workspaceTab, setWorkspaceTab] = useState<WorkspaceTab>('CRM');
  const [queueMenuOpen, setQueueMenuOpen] = useState(false);
  const [calls, setCalls] = useState<PhoneCall[]>([]);
  const [callHistory, setCallHistory] = useState<CallLogEntry[]>([]);
  const [showCallHistory, setShowCallHistory] = useState(false);
  const [callHistoryLoading, setCallHistoryLoading] = useState(false);
  const [callHistoryError, setCallHistoryError] = useState('');
  const [shifts, setShifts] = useState<AgentShiftEntry[]>([]);
  const [shiftsLoading, setShiftsLoading] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [addingCall, setAddingCall] = useState(false);
  const [dialing, setDialing] = useState(false);
  const [callError, setCallError] = useState('');
  const [doNotDisturb, setDoNotDisturb] = useState(false);
  const [demoMode, setDemoMode] = useState(true);
  const demoRingTimers = useRef(new Map<string, ReturnType<typeof setInterval>>());
  const activeCall = calls.find((call) => call.id === activeCallId && call.status !== 'ended') ?? null;
  const liveCalls = calls.filter((call) => call.status !== 'ended');
  const callControlsReady = Boolean(activeCall?.demo || (activeCall?.session && activeCall.status === 'connected'));

  useEffect(() => () => {
    for (const timer of demoRingTimers.current.values()) clearInterval(timer);
    demoRingTimers.current.clear();
    if (Platform.OS !== 'web') Vibration.cancel();
  }, []);

  useEffect(() => {
    if (!token) return;
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiRequest<CallLogEntry[]>('/api/calls', {}, token);
        if (active) {
          setCallHistory(result);
          setCallHistoryError('');
        }
      } catch (error) {
        if (active) setCallHistoryError(error instanceof Error ? error.message : 'Unable to load call history.');
      } finally {
        if (active) setCallHistoryLoading(false);
      }
    };
    setCallHistoryLoading(true);
    void refresh();
    const interval = setInterval(refresh, 15_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [token]);

  useEffect(() => {
    if (workspaceTab !== 'Agents' || !token || user?.role !== 'agent') return;
    let active = true;
    setShiftsLoading(true);
    const fetchShifts = () => {
      apiRequest<AgentShiftEntry[]>('/api/agent-shifts', {}, token)
        .then((data) => { if (active) setShifts(data); })
        .catch(() => {})
        .finally(() => { if (active) setShiftsLoading(false); });
    };
    fetchShifts();
    const interval = setInterval(fetchShifts, 20_000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [workspaceTab, token, user?.role]);

  function updateCall(callId: string, patch: Partial<PhoneCall>) {
    setCalls((current) => current.map((call) => call.id === callId ? { ...call, ...patch } : call));
  }

  async function updateDemoCallLog(logId: string, status: 'in-progress' | 'completed' | 'canceled', durationSeconds?: number) {
    if (!token) return;
    try {
      await apiRequest(`/api/calls/demo/${logId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, ...(durationSeconds === undefined ? {} : { durationSeconds }) }),
      }, token);
      const timestamp = new Date().toISOString();
      setCallHistory((current) => current.map((entry) => entry.id === logId ? {
        ...entry,
        status,
        answeredAt: status === 'in-progress' ? timestamp : entry.answeredAt,
        endedAt: status === 'completed' || status === 'canceled' ? timestamp : entry.endedAt,
        durationSeconds: durationSeconds ?? entry.durationSeconds,
      } : entry));
    } catch (error) {
      setCallHistoryError(error instanceof Error ? error.message : 'Unable to update demo call history.');
    }
  }

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
        <ScrollView style={styles.infoContent} contentContainerStyle={{ paddingBottom: 24 }}>
          <Text style={styles.infoTitle}>Agents online ({agents.length})</Text>
          {agentsLoading && agents.length === 0 ? <Text style={styles.infoMeta}>Checking availability…</Text> : null}
          {!agentsLoading && agents.length === 0 ? <Text style={styles.infoMeta}>No agents are online</Text> : null}
          {agents.map((agent) => (
            <View key={agent.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginVertical: 4 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#2D9D65' }} />
              <Text style={styles.infoLine}>{agent.displayName}</Text>
            </View>
          ))}

          <Text style={[styles.infoTitle, { marginTop: 18, borderTopWidth: 1, borderTopColor: '#DDE3E7', paddingTop: 12 }]}>
            Attendance & Shifts
          </Text>
          {shiftsLoading && shifts.length === 0 ? <Text style={styles.infoMeta}>Loading shift logs…</Text> : null}
          {!shiftsLoading && shifts.length === 0 ? <Text style={styles.infoMeta}>No shift records yet.</Text> : null}
          {shifts.slice(0, 15).map((shift) => (
            <View key={shift.id} style={{ marginVertical: 5, padding: 9, backgroundColor: 'rgba(22,143,208,0.06)', borderRadius: 8, borderWidth: 1, borderColor: '#DDE3E7' }}>
              <Text style={{ fontWeight: '700', fontSize: 13, color: '#34424B' }}>{shift.agentName}</Text>
              <Text style={{ fontSize: 11, color: '#7E8A92', marginTop: 2 }}>
                Login: {new Date(shift.loginAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}
              </Text>
              <Text style={{ fontSize: 11, fontWeight: '600', color: shift.status === 'active' ? '#2D9D65' : '#7E8A92', marginTop: 1 }}>
                {shift.status === 'active'
                  ? '● Active now'
                  : `Logout: ${shift.logoutAt ? new Date(shift.logoutAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Offline'} (${shift.durationMinutes} min)`}
              </Text>
            </View>
          ))}
        </ScrollView>
      );
    }
    return (
      <View style={styles.emptyCrm}>
        <Text style={styles.emptyCrmText}>No CRM page available</Text>
      </View>
    );
  }

  async function startCall() {
    const destination = number.trim();
    if (!token || !destination || dialing) return;
    const previousCall = activeCall;
    setDialing(true);
    setCallError('');
    try {
      if (previousCall && !previousCall.held) {
        await setCallHeld(previousCall, true);
      }

      const callId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      if (demoMode) {
        const demoLog = await apiRequest<CallLogEntry>('/api/calls/demo', {
          method: 'POST',
          body: JSON.stringify({ to: destination }),
        }, token);
        setCallHistory((current) => [demoLog, ...current]);
        setCalls((current) => [...current, {
          id: callId,
          destination,
          demo: true,
          demoRings: 1,
          logId: demoLog.id,
          startedAt: Date.now(),
          status: 'ringing',
          muted: false,
          mutedBeforeHold: false,
          held: false,
          route: 'speaker',
          audioDevices: [],
          session: null,
        }]);
        setActiveCallId(callId);
        setNumber('');
        setAddingCall(false);
        playDemoRingback();
        let ringCount = 1;
        const ringTimer = setInterval(() => {
          ringCount += 1;
          playDemoRingback();
          if (ringCount >= 10) {
            clearInterval(ringTimer);
            demoRingTimers.current.delete(callId);
            updateCall(callId, { status: 'connected', demoRings: ringCount });
            void updateDemoCallLog(demoLog.id, 'in-progress');
          } else {
            updateCall(callId, { demoRings: ringCount });
          }
        }, 1200);
        demoRingTimers.current.set(callId, ringTimer);
        return;
      }
      if (!token) throw new Error('Sign in before placing a call.');

      setCalls((current) => [...current, {
        id: callId,
        destination,
        demo: false,
        status: 'connecting',
        muted: false,
        mutedBeforeHold: false,
        held: false,
        route: Platform.OS === 'web' ? 'speaker' : 'earpiece',
        audioDevices: [],
        session: null,
      }]);
      setActiveCallId(callId);

      const result = await apiRequest<{ token: string }>('/api/calls/token', {
        method: 'POST',
        body: JSON.stringify({}),
      }, token);
      const session = await connectVoice(result.token, destination, callId, (status) => {
        updateCall(callId, { status });
        if (status === 'ended') setActiveCallId((current) => current === callId ? null : current);
      }, setCallError);
      const audioDevices = await session.getAudioDevices().catch(() => []);
      updateCall(callId, { session, audioDevices });
      setNumber('');
      setAddingCall(false);
    } catch (requestError) {
      setCalls((current) => current.filter((call) => call.status !== 'connecting'));
      setActiveCallId(previousCall?.id ?? null);
      if (previousCall?.demo && !previousCall.held) {
        updateCall(previousCall.id, { held: false, mutedBeforeHold: false });
      } else if (previousCall?.session && previousCall.held === false) {
        await previousCall.session.setHeld(false).catch(() => undefined);
        if (previousCall.session.holdMode === 'mute') await previousCall.session.setMuted(previousCall.muted).catch(() => undefined);
        updateCall(previousCall.id, { held: false, muted: previousCall.muted, mutedBeforeHold: false });
      }
      setCallError(requestError instanceof Error ? requestError.message : 'Call could not be started.');
    } finally {
      setDialing(false);
    }
  }

  async function toggleMute(call: PhoneCall) {
    if (call.demo) {
      updateCall(call.id, { muted: !call.muted });
      return;
    }
    if (!call.session) return;
    const muted = !call.muted;
    try {
      await call.session.setMuted(muted);
      updateCall(call.id, { muted });
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Could not change mute state.');
    }
  }

  async function setCallHeld(call: PhoneCall, held: boolean) {
    if (call.held === held) return;
    if (call.demo) {
      updateCall(call.id, { held, mutedBeforeHold: held ? call.muted : false });
      return;
    }
    if (!call.session) return;
    try {
      if (held) {
        await call.session.setHeld(true);
        updateCall(call.id, {
          held: true,
          mutedBeforeHold: call.muted,
          muted: call.session.holdMode === 'mute' ? true : call.muted,
        });
      } else {
        await call.session.setHeld(false);
        if (call.session.holdMode === 'mute') await call.session.setMuted(call.mutedBeforeHold);
        updateCall(call.id, {
          held: false,
          muted: call.session.holdMode === 'mute' ? call.mutedBeforeHold : call.muted,
          mutedBeforeHold: false,
        });
      }
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Could not change hold state.');
      throw error;
    }
  }

  async function toggleHold(call: PhoneCall) {
    try {
      await setCallHeld(call, !call.held);
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Could not change hold state.');
    }
  }

  async function selectAudioRoute(call: PhoneCall, route: AudioRouteType) {
    if (call.demo) {
      updateCall(call.id, { route });
      return;
    }
    if (!call.session) return;
    try {
      await call.session.setAudioRoute(route);
      updateCall(call.id, { route });
      setCallError('');
    } catch (error) {
      setCallError(error instanceof Error ? error.message : `Could not switch to ${route}.`);
    }
  }

  async function chooseBluetooth(call: PhoneCall) {
    if (call.demo) {
      updateCall(call.id, { route: 'bluetooth' });
      return;
    }
    if (!call.session) return;
    try {
      const audioDevices = await call.session.getAudioDevices();
      updateCall(call.id, { audioDevices });
      if (audioDevices.some((device) => device.type === 'bluetooth')) {
        await selectAudioRoute(call, 'bluetooth');
      } else if (Platform.OS === 'ios') {
        await call.session.showAudioRoutePicker();
      } else {
        setCallError('Connect a Bluetooth audio device, then try again.');
      }
    } catch (error) {
      setCallError(error instanceof Error ? error.message : 'Could not open Bluetooth audio routes.');
    }
  }

  async function switchCall(nextCall: PhoneCall) {
    if (activeCall && activeCall.id !== nextCall.id && !activeCall.held) {
      await setCallHeld(activeCall, true);
    }
    if (nextCall.held) {
      await setCallHeld(nextCall, false);
    }
    setActiveCallId(nextCall.id);
    setAddingCall(false);
  }

  async function endCall(call: PhoneCall) {
    const ringTimer = demoRingTimers.current.get(call.id);
    if (ringTimer) {
      clearInterval(ringTimer);
      demoRingTimers.current.delete(call.id);
      if (Platform.OS !== 'web') Vibration.cancel();
    }
    if (call.demo && call.logId) {
      const completed = call.status === 'connected';
      const durationSeconds = completed && call.startedAt
        ? Math.max(0, Math.floor((Date.now() - call.startedAt) / 1000))
        : 0;
      await updateDemoCallLog(call.logId, completed ? 'completed' : 'canceled', durationSeconds);
    }
    await call.session?.disconnect().catch((error) => {
      setCallError(error instanceof Error ? error.message : 'Could not end the call.');
    });
    updateCall(call.id, { status: 'ended' });
    const nextCall = calls.find((candidate) => candidate.id !== call.id && candidate.status !== 'ended');
    if (nextCall) {
      if (nextCall.session && nextCall.held) await setCallHeld(nextCall, false);
      setActiveCallId(nextCall.id);
    } else {
      setActiveCallId(null);
    }
  }

  function pressDigit(digit: string) {
    if (activeCall && !addingCall && activeCall.session) {
      void activeCall.session.sendDigits(digit).catch((error) => setCallError(error instanceof Error ? error.message : 'Could not send keypad tone.'));
      return;
    }
    setNumber((value) => value + digit);
    playDialTone(digit);
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.brandIcon}><Text style={styles.brandIconText}>A</Text></View>
        <Text style={styles.headerTitle}>{user?.role === 'agent' ? 'Agent panel' : 'Workspace'}</Text>
        <Text numberOfLines={1} style={styles.currentUser}>{user?.displayName}</Text>
        <View style={styles.agentBadge}><Text style={styles.agentInitials}>{user?.displayName.slice(0, 2).toUpperCase()}</Text></View>
        <Pressable accessibilityRole="button" onPress={() => { void signOut(); }} style={styles.signOutButton}>
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={[styles.content, compact && styles.compactContent, compact && { paddingBottom: 82 + insets.bottom }]} keyboardShouldPersistTaps="handled">
        <View style={styles.queueHeader}>
          <View style={styles.queueHeadingRow}>
            <Text style={styles.queueHeading}>Voice Queues</Text>
            <Text style={styles.loggedIn}>(Agents online: {agents.length})</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Choose voice queue"
            onPress={() => setQueueMenuOpen((open) => !open)}
            style={[styles.queueSelect, compact && styles.compactQueueSelect]}>
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

        <View style={[styles.workspaceTabs, compact && styles.compactWorkspaceTabs]}>
          {(['CRM', 'Queues', 'Agents'] as WorkspaceTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPress={() => setWorkspaceTab(tab)}
              style={[styles.workspaceTab, compact && styles.compactWorkspaceTab, workspaceTab === tab && styles.workspaceTabActive]}>
              <Text style={[styles.workspaceTabText, workspaceTab === tab && styles.workspaceTabTextActive]}>
                {tab}{tab === 'Queues' ? ' (1)' : tab === 'Agents' ? ' (2)' : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        <View style={[styles.workspacePanel, compact && styles.compactWorkspacePanel]}>{workspaceContent()}</View>

        <View style={[styles.phonePanel, compact && styles.compactPhonePanel]}>
          <View style={[styles.phoneTabs, compact && styles.compactPhoneTabs]}>
            <Pressable accessibilityRole="button" onPress={() => setShowCallHistory(true)} style={[styles.phoneTab, showCallHistory && styles.phoneTabActive]}>
              <Text style={showCallHistory ? styles.phoneTabTextActive : styles.phoneTabText}>Calls ({callHistory.length})</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setShowCallHistory(false)} style={[styles.phoneTab, !showCallHistory && styles.phoneTabActive]}>
              <Text style={!showCallHistory ? styles.phoneTabTextActive : styles.phoneTabText}>Phone</Text>
            </Pressable>
          </View>
          <View style={[styles.phoneTools, compact && styles.compactPhoneTools]}>
            <View style={[styles.onlineDot, demoMode ? styles.softphoneOnline : styles.softphoneOffline]} />
            <Text style={styles.phoneReadyText}>{activeCall ? `${activeCall.demo ? 'DEMO · ' : ''}${activeCall.status.toUpperCase()}` : demoMode ? 'DEMO MODE' : 'LIVE SOFTPHONE'}</Text>
            {activeCall && <Text style={styles.callTimerLabel}>{activeCall.destination}</Text>}
          </View>

          {activeCall && !addingCall && !showCallHistory ? (
            <View style={styles.activeCall}>
              <Text style={styles.activeCallStatus}>{activeCall.held ? 'On hold' : activeCall.demo && activeCall.status === 'ringing' ? `Ringing ${activeCall.demoRings ?? 1}/10` : activeCall.status === 'connected' ? activeCall.demo ? 'Demo connected' : 'Connected' : activeCall.status === 'ended' ? 'Call ended' : 'Calling'}</Text>
              <Text style={styles.activeCallNumber}>{activeCall.destination}</Text>
              {activeCall.demo && <Text style={styles.demoHint}>DEMO SIMULATION · NO PHONE NETWORK</Text>}
              {liveCalls.length > 1 && (
                <View style={styles.callSwitcher}>
                  {liveCalls.map((call) => (
                    <Pressable key={call.id} onPress={() => { void switchCall(call); }} style={[styles.callChip, call.id === activeCall.id && styles.callChipActive]}>
                      <Text style={[styles.callChipText, call.id === activeCall.id && styles.callChipTextActive]}>{call.held ? 'Held · ' : ''}{call.destination}</Text>
                    </Pressable>
                  ))}
                </View>
              )}
              <View style={styles.callControls}>
                <Pressable accessibilityRole="button" accessibilityLabel={activeCall.muted ? 'Unmute call' : 'Mute call'} disabled={!callControlsReady} onPress={() => { void toggleMute(activeCall); }} style={[styles.callControl, activeCall.muted && styles.callControlActive, !callControlsReady && styles.disabledCallControl]}>
                  <Text style={styles.callControlGlyph}>{activeCall.muted ? '×' : '●'}</Text><Text style={styles.callControlText}>{activeCall.muted ? 'Unmute' : 'Mute'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel={activeCall.held ? 'Resume call' : 'Hold call'} disabled={!callControlsReady} onPress={() => { void toggleHold(activeCall); }} style={[styles.callControl, activeCall.held && styles.callControlActive, !callControlsReady && styles.disabledCallControl]}>
                  <Text style={styles.callControlGlyph}>{activeCall.held ? '▶' : 'Ⅱ'}</Text><Text style={styles.callControlText}>{activeCall.held ? 'Resume' : 'Hold'}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Toggle speaker" disabled={!callControlsReady} onPress={() => { void selectAudioRoute(activeCall, activeCall.route === 'speaker' ? 'earpiece' : 'speaker'); }} style={[styles.callControl, activeCall.route === 'speaker' && styles.callControlActive, !callControlsReady && styles.disabledCallControl]}>
                  <Text style={styles.callControlGlyph}>◖))</Text><Text style={styles.callControlText}>Speaker</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Bluetooth audio" disabled={!callControlsReady} onPress={() => { void chooseBluetooth(activeCall); }} style={[styles.callControl, activeCall.route === 'bluetooth' && styles.callControlActive, !callControlsReady && styles.disabledCallControl]}>
                  <Text style={styles.callControlGlyph}>ᛒ</Text><Text style={styles.callControlText}>Bluetooth</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="Add call" disabled={!callControlsReady} onPress={() => { setNumber(''); setAddingCall(true); setCallError(''); }} style={[styles.callControl, !callControlsReady && styles.disabledCallControl]}>
                  <Text style={styles.callControlGlyph}>＋</Text><Text style={styles.callControlText}>Add call</Text>
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="End call" disabled={!activeCall.demo && !activeCall.session} onPress={() => { void endCall(activeCall); }} style={[styles.callControl, styles.endCallControl, !activeCall.demo && !activeCall.session && styles.disabledCallControl]}>
                  <Text style={styles.callControlGlyph}>☎</Text><Text style={styles.callControlText}>End</Text>
                </Pressable>
              </View>
              {activeCall.demo ? <Text style={styles.webHoldHint}>All controls are simulated; no audio call is placed.</Text> : activeCall.session?.holdMode === 'mute' ? <Text style={styles.webHoldHint}>Browser hold mutes your microphone; mobile hold uses Twilio call hold.</Text> : null}
            </View>
          ) : showCallHistory ? (
            <ScrollView style={styles.callHistoryList} contentContainerStyle={styles.callHistoryContent}>
              {callHistoryLoading && callHistory.length === 0 ? <Text style={styles.callHistoryHint}>Loading calls…</Text> : null}
              {!callHistoryLoading && callHistory.length === 0 ? <Text style={styles.callHistoryHint}>No calls recorded yet.</Text> : null}
              {callHistory.map((call) => {
                const target = call.direction === 'outbound' ? call.to : call.from;
                const direction = call.direction === 'outbound' ? 'Outgoing' : 'Incoming';
                const status = call.status.replace('-', ' ');
                const time = new Date(call.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
                return (
                  <View key={call.id} style={styles.callHistoryRow}>
                    <View style={styles.callHistoryMain}>
                      <Text numberOfLines={1} style={styles.callHistoryNumber}>{target}</Text>
                      <Text style={styles.callHistoryMeta}>{direction} · {status}{call.mode === 'demo' ? ' · Demo' : ''}</Text>
                    </View>
                    <View style={styles.callHistoryDetails}>
                      <Text style={styles.callHistoryTime}>{time}</Text>
                      <Text style={styles.callHistoryDuration}>{call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}:${String(call.durationSeconds % 60).padStart(2, '0')}` : '—'}</Text>
                    </View>
                  </View>
                );
              })}
              {!!callHistoryError && <Text accessibilityRole="alert" style={styles.callHistoryError}>{callHistoryError}</Text>}
            </ScrollView>
          ) : (
            <>
              {addingCall && activeCall && (
                <View style={styles.addCallBanner}>
                  <Text style={styles.addCallBannerText}>Current call will be held when the new call connects.</Text>
                  <Pressable onPress={() => { setAddingCall(false); setNumber(''); }}><Text style={styles.cancelAddCall}>Cancel</Text></Pressable>
                </View>
              )}
              <View style={styles.numberEntry}>
                <TextInput
                  accessibilityLabel="Phone number"
                  value={number}
                  onChangeText={setNumber}
                  placeholder="Enter number or drag-in people"
                  placeholderTextColor="#B7BEC3"
                  keyboardType="phone-pad"
                  style={[styles.numberInput, compact && styles.compactNumberInput]}
                  textAlign="center"
                />
                {number.length > 0 && (
                  <Pressable accessibilityLabel="Delete last digit" onPress={() => setNumber((value) => value.slice(0, -1))}>
                    <Text style={styles.deleteGlyph}>⌫</Text>
                  </Pressable>
                )}
              </View>
              <View style={[styles.keypad, compact && styles.compactKeypad]}>
                {digits.map(([digit, letters]) => (
                  <Pressable
                    key={digit}
                    accessibilityLabel={`Dial ${digit}`}
                    onPress={() => pressDigit(digit)}
                    style={({ pressed }) => [styles.digitKey, compact && styles.compactDigitKey, pressed && styles.digitKeyPressed]}>
                    <Text style={styles.digitText}>{digit}</Text>
                    {letters ? <Text style={styles.digitLetters}>{letters}</Text> : null}
                  </Pressable>
                ))}
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={demoMode ? 'Start demo call' : 'Start call'}
                disabled={!number.trim() || dialing}
                onPress={() => { void startCall(); }}
                style={[styles.callButton, compact && styles.compactCallButton, (!number.trim() || dialing) && styles.callButtonDisabled]}>
                <Text style={styles.callGlyph}>{dialing ? '…' : '☎'}</Text>
              </Pressable>
            </>
          )}

          {!!callError && <Text accessibilityRole="alert" style={styles.callError}>{callError}</Text>}

          <View style={[styles.phoneFooter, compact && styles.compactPhoneFooter]}>
            <Pressable onPress={() => setNumber('')} style={styles.footerButton}>
              <Text style={styles.footerText}>ACCESS CODES</Text>
            </Pressable>
            <Pressable onPress={() => setDoNotDisturb((enabled) => !enabled)} style={styles.footerButton}>
              <Text style={[styles.footerText, doNotDisturb && styles.footerTextActive]}>{doNotDisturb ? 'DND ON' : 'DND'}</Text>
            </Pressable>
            <Pressable disabled={liveCalls.length > 0} onPress={() => setDemoMode((enabled) => !enabled)} style={styles.footerButton}>
              <Text style={[styles.footerText, demoMode && styles.footerTextActive]}>{demoMode ? 'DEMO MODE' : 'LIVE CALLS'}</Text>
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
  currentUser: { maxWidth: 90, color: muted, fontSize: 11 },
  agentBadge: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F5F6', borderRadius: 5 },
  agentInitials: { color: dark, fontSize: 12, fontWeight: '600' },
  signOutButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 6 },
  signOutText: { color: blue, fontSize: 11, fontWeight: '600' },
  content: { padding: 14, gap: 12, paddingBottom: 22 },
  compactContent: { padding: 10, gap: 8 },
  queueHeader: { zIndex: 2 },
  queueHeadingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  queueHeading: { color: blue, fontSize: 13, fontWeight: '500' },
  loggedIn: { color: blue, fontSize: 12 },
  queueSelect: { minHeight: 40, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, borderRadius: 4 },
  compactQueueSelect: { minHeight: 34 },
  queueName: { flex: 1, color: '#505D66', fontSize: 12 },
  chevron: { color: muted, fontSize: 17, paddingLeft: 8 },
  queueOption: { height: 40, marginTop: 1, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border },
  checkmark: { color: blue, fontSize: 15 },
  workspaceTabs: { flexDirection: 'row', gap: 4 },
  compactWorkspaceTabs: { gap: 3 },
  workspaceTab: { minHeight: 38, flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: blue, borderRadius: 20 },
  compactWorkspaceTab: { minHeight: 32 },
  workspaceTabActive: { backgroundColor: blue },
  workspaceTabText: { color: blue, fontSize: 12 },
  workspaceTabTextActive: { color: '#FFFFFF' },
  workspacePanel: { minHeight: 112, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, borderRadius: 8, overflow: 'hidden' },
  compactWorkspacePanel: { minHeight: 72 },
  emptyCrm: { flex: 1, minHeight: 110, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7F7F7' },
  emptyCrmText: { color: '#727F88', fontSize: 14 },
  infoContent: { flex: 1, justifyContent: 'center', paddingHorizontal: 18, gap: 6 },
  infoTitle: { color: dark, fontSize: 14, fontWeight: '600' },
  infoLine: { color: '#52616A', fontSize: 12 },
  infoMeta: { color: muted, fontSize: 11 },
  callHistoryList: { maxHeight: 340 },
  callHistoryContent: { paddingHorizontal: 13, paddingVertical: 5 },
  callHistoryHint: { color: muted, fontSize: 12, textAlign: 'center', paddingVertical: 28 },
  callHistoryRow: { minHeight: 66, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#EDF0F2' },
  callHistoryMain: { flex: 1, gap: 4 },
  callHistoryNumber: { color: dark, fontSize: 14, fontWeight: '600' },
  callHistoryMeta: { color: muted, fontSize: 10, textTransform: 'capitalize' },
  callHistoryDetails: { alignItems: 'flex-end', gap: 4 },
  callHistoryTime: { color: muted, fontSize: 10 },
  callHistoryDuration: { color: dark, fontSize: 11, fontWeight: '600' },
  callHistoryError: { color: '#B42318', fontSize: 11, paddingVertical: 8 },
  phonePanel: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: border, borderRadius: 8, overflow: 'hidden' },
  compactPhonePanel: { width: '100%' },
  phoneTabs: { height: 38, flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: border },
  compactPhoneTabs: { height: 32 },
  phoneTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phoneTabActive: { backgroundColor: blue },
  phoneTabText: { color: '#48565E', fontSize: 12 },
  phoneTabTextActive: { color: '#FFFFFF', fontSize: 12 },
  phoneTools: { height: 34, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 7 },
  compactPhoneTools: { height: 25 },
  onlineDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#2D9D65' },
  softphoneOnline: { backgroundColor: '#2D9D65' },
  softphoneOffline: { backgroundColor: '#A8B0B5' },
  phoneReadyText: { color: muted, fontSize: 9, fontWeight: '700' },
  callTimerLabel: { color: dark, fontSize: 10, marginLeft: 'auto' },
  numberEntry: { minHeight: 54, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 14 },
  numberInput: { flex: 1, color: dark, fontSize: 14, paddingVertical: 8 },
  compactNumberInput: { paddingVertical: 4 },
  deleteGlyph: { color: muted, fontSize: 19, paddingHorizontal: 8 },
  keypad: { width: 216, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', rowGap: 8, columnGap: 10, marginTop: 2 },
  compactKeypad: { width: 196, rowGap: 5, columnGap: 8 },
  digitKey: { width: 62, height: 51, borderRadius: 28, borderWidth: 1, borderColor: '#D5DADD', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  compactDigitKey: { width: 56, height: 43, borderRadius: 24 },
  digitKeyPressed: { backgroundColor: '#EFF8FC' },
  digitText: { color: blue, fontSize: 16, lineHeight: 19 },
  digitLetters: { color: '#89939A', fontSize: 7, lineHeight: 9 },
  callButton: { width: 54, height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: 15, marginBottom: 13, backgroundColor: '#56B52B' },
  compactCallButton: { width: 46, height: 46, borderRadius: 23, marginTop: 8, marginBottom: 8 },
  callGlyph: { color: '#FFFFFF', fontSize: 27, lineHeight: 32, transform: [{ rotate: '-35deg' }] },
  phoneFooter: { minHeight: 34, borderTopWidth: 1, borderTopColor: '#F0F1F2', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 11 },
  compactPhoneFooter: { minHeight: 28 },
  footerButton: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 5 },
  footerText: { color: '#747F86', fontSize: 8 },
  footerTextActive: { color: blue },
  activeCall: { minHeight: 250, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 16 },
  activeCallStatus: { color: muted, fontSize: 13 },
  demoHint: { color: '#A0AAB1', fontSize: 9, fontWeight: '700' },
  activeCallNumber: { color: dark, fontSize: 22, fontWeight: '600' },
  callSwitcher: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 6 },
  callChip: { minHeight: 30, justifyContent: 'center', paddingHorizontal: 10, borderWidth: 1, borderColor: border, borderRadius: 16 },
  callChipActive: { backgroundColor: '#E8F5FB', borderColor: blue },
  callChipText: { color: muted, fontSize: 10 },
  callChipTextActive: { color: blue, fontWeight: '600' },
  callControls: { width: '100%', maxWidth: 330, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  callControl: { width: '30%', minWidth: 88, minHeight: 62, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: border, borderRadius: 8, backgroundColor: '#F8FAFB' },
  disabledCallControl: { opacity: 0.45 },
  callControlActive: { backgroundColor: '#E5F4FB', borderColor: blue },
  endCallControl: { backgroundColor: '#D9514B', borderColor: '#D9514B' },
  callControlGlyph: { color: dark, fontSize: 17, lineHeight: 20, fontWeight: '700' },
  callControlText: { color: dark, fontSize: 10, fontWeight: '600' },
  webHoldHint: { maxWidth: 300, color: muted, fontSize: 10, textAlign: 'center' },
  addCallBanner: { minHeight: 36, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, marginHorizontal: 10, marginTop: 8, borderRadius: 5, backgroundColor: '#FFF8E8' },
  addCallBannerText: { flex: 1, color: '#795B19', fontSize: 10 },
  cancelAddCall: { color: blue, fontSize: 11, fontWeight: '600', paddingHorizontal: 8 },
  callButtonDisabled: { opacity: 0.45 },
  callError: { color: '#B42318', fontSize: 11, textAlign: 'center', paddingHorizontal: 10, paddingVertical: 6 },
});