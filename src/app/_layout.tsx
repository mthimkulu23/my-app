import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import AppTabs from '@/components/app-tabs';
import { AuthScreen } from '@/components/auth-screen';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ChatNotificationProvider } from '@/lib/chat-notifications';

// Only prevent auto hide on native devices
if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync().catch(() => {});
}

export default function TabLayout() {
  useEffect(() => {
    if (Platform.OS === 'web') {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AnimatedSplashOverlay />
        <ChatNotificationProvider>
          <AuthenticatedApp />
        </ChatNotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

function AuthenticatedApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, minHeight: '100%', justifyContent: 'center', alignItems: 'center', backgroundColor: '#050916' }}>
        <ActivityIndicator size="large" color="#168FD0" />
      </View>
    );
  }

  return user ? <AppTabs /> : <AuthScreen />;
}
