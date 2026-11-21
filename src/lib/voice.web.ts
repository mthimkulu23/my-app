import { Device } from '@twilio/voice-sdk';

import { VoiceSession, VoiceStatus } from './voice.types';

export async function connectVoice(
  token: string,
  destination: string,
  onStatus: (status: VoiceStatus) => void,
  onError: (message: string) => void,
): Promise<VoiceSession> {
  const device = new Device(token, { closeProtection: true, enableImprovedSignalingErrorPrecision: true });
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
      disconnect: async () => {
        call.disconnect();
        device.destroy();
      },
      setMuted: async (muted) => { call.mute(muted); },
    };
  } catch (error) {
    device.destroy();
    throw error;
  }
}