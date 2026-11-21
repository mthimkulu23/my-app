import { Platform } from 'react-native';

const sessionKey = 'relay.session';

export async function readSession(): Promise<string | null> {
  if (Platform.OS === 'web') return globalThis.localStorage?.getItem(sessionKey) ?? null;
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(sessionKey);
}

export async function writeSession(token: string): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.setItem(sessionKey, token);
    return;
  }
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync(sessionKey, token);
}

export async function clearSession(): Promise<void> {
  if (Platform.OS === 'web') {
    globalThis.localStorage?.removeItem(sessionKey);
    return;
  }
  const SecureStore = await import('expo-secure-store');
  await SecureStore.deleteItemAsync(sessionKey);
}