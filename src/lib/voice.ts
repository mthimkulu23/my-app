import { Call, Voice } from '@twilio/voice-react-native-sdk';

import { VoiceSession, VoiceStatus } from './voice.types';

export async function connectVoice(
  token: string,
  destination: string,
  onStatus: (status: VoiceStatus) => void,
  onError: (message: string) => void,
): Promise<VoiceSession> {
  const voice = new Voice();
  const call = await voice.connect(token, {
    params: { To: destination },
    contactHandle: destination,
    notificationDisplayName: destination,
  });

  call.on(Call.Event.Ringing, () => onStatus('ringing'));
  call.on(Call.Event.Connected, () => onStatus('connected'));
  call.on(Call.Event.ConnectFailure, (error) => {
    onError(error.message);
    onStatus('ended');
  });
  call.on(Call.Event.Disconnected, () => onStatus('ended'));

  return {
    disconnect: () => call.disconnect(),
    setMuted: async (muted) => { await call.mute(muted); },
  };
}