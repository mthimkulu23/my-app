import { AudioDevice, Call, Voice } from '@twilio/voice-react-native-sdk';

import { AudioRouteType, VoiceAudioDevice, VoiceSession, VoiceStatus } from './voice.types';

export async function connectVoice(
  token: string,
  destination: string,
  callId: string,
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
    id: callId,
    holdMode: 'native',
    disconnect: () => call.disconnect(),
    setMuted: async (muted) => { await call.mute(muted); },
    setHeld: async (held) => { await call.hold(held); },
    getAudioDevices: async (): Promise<VoiceAudioDevice[]> => {
      const { audioDevices } = await voice.getAudioDevices();
      return audioDevices.map((device) => ({
        id: device.uuid,
        name: device.name,
        type: device.type as AudioRouteType,
      }));
    },
    setAudioRoute: async (route) => {
      const { audioDevices } = await voice.getAudioDevices();
      const device = audioDevices.find((audioDevice) => audioDevice.type === route);
      if (!device) throw new Error(`No ${route} audio device is available.`);
      await device.select();
    },
    showAudioRoutePicker: () => voice.showAvRoutePickerView(),
    sendDigits: (digits) => call.sendDigits(digits),
  };
}