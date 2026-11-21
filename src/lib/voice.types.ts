export type VoiceStatus = 'connecting' | 'ringing' | 'connected' | 'ended';

export type AudioRouteType = 'speaker' | 'bluetooth' | 'earpiece' | 'other';

export type VoiceAudioDevice = {
  id: string;
  name: string;
  type: AudioRouteType;
};

export type VoiceSession = {
  id: string;
  holdMode: 'native' | 'mute';
  disconnect: () => Promise<void>;
  setMuted: (muted: boolean) => Promise<void>;
  setHeld: (held: boolean) => Promise<void>;
  getAudioDevices: () => Promise<VoiceAudioDevice[]>;
  setAudioRoute: (route: AudioRouteType) => Promise<void>;
  showAudioRoutePicker: () => Promise<void>;
  sendDigits: (digits: string) => Promise<void>;
};