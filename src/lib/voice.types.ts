export type VoiceStatus = 'ringing' | 'connected' | 'ended';

export type VoiceSession = {
  disconnect: () => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
};