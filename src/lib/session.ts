import { Platform } from 'react-native';

const sessionKey = 'relay.session';
let webSession: string | null = null;

export async function readSession(): Promise<string | null> {
  if (Platform.OS === 'web') return webSession;
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(sessionKey);
}

export async function writeSession(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    webSession = token;
    return;
  }
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync(sessionKey, token);
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    webSession = null;
    return;
  }
  const SecureStore = await import('expo-secure-store');
  await SecureStore.deleteItemAsync(sessionKey);
}