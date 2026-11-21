import { Device } from '@twilio/voice-sdk';

import { AudioRouteType, VoiceAudioDevice, VoiceSession, VoiceStatus } from './voice.types';

export async function connectVoice(
  token: string,
  destination: string,
  callId: string,
  onStatus: (status: VoiceStatus) => void,
  onError: (message: string) => void,
): Promise<VoiceSession> {
  const device = new Device(token, { closeProtection: true, enableImprovedSignalingErrorPrecision: true });
  device.on('error', (error) => onError(error.message));
  try {
    const call = await device.connect({ params: { To: destination } });
    call.on('ringing', () => onStatus('ringing'));
    call.on('accept', () => onStatus('connected'));
    call.on('disconnect', () => {
      onStatus('ended');
      device.destroy();
    });
    call.on('error', (error) => onError(error.message));
    return {
      id: callId,
      holdMode: 'mute',
      disconnect: async () => {
        call.disconnect();
        device.destroy();
      },
      setMuted: async (muted) => { call.mute(muted); },
      setHeld: async (held) => { call.mute(held); },
      getAudioDevices: async (): Promise<VoiceAudioDevice[]> => Array.from(device.audio.availableOutputDevices.values()).map((audioDevice) => ({
        id: audioDevice.deviceId,
        name: audioDevice.label || 'Audio output',
        type: /bluetooth/i.test(audioDevice.label) ? 'bluetooth' : /earpiece/i.test(audioDevice.label) ? 'earpiece' : 'speaker',
      })),
      setAudioRoute: async (route: AudioRouteType) => {
        const audioDevices = Array.from(device.audio.availableOutputDevices.values());
        const audioDevice = route === 'speaker'
          ? audioDevices.find((item) => item.deviceId === 'default') ?? audioDevices[0]
          : route === 'earpiece'
            ? audioDevices.find((item) => /earpiece/i.test(item.label)) ?? audioDevices.find((item) => item.deviceId === 'default') ?? audioDevices[0]
            : audioDevices.find((item) => route === 'other' || new RegExp(route, 'i').test(item.label));
        if (!audioDevice) throw new Error(`No ${route} audio output is available in this browser.`);
        await device.audio.speakerDevices.set(audioDevice.deviceId);
      },
      showAudioRoutePicker: async () => undefined,
      sendDigits: async (digits) => { call.sendDigits(digits); },
    };
  } catch (error) {
    device.destroy();
    throw error;
  }
}