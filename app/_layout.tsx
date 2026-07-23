import { useCallback, useEffect, useRef } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isAppConfigured } from '@/lib/config';
import ConfigurationErrorScreen from '@/components/ConfigurationErrorScreen';

function NotificationRedirector() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const handledRequestIdentifiers = useRef(new Set<string>());

  const openResponse = useCallback(
    (response: Notifications.NotificationResponse) => {
      const requestIdentifier = response.notification.request.identifier;
      const eventId = response.notification.request.content.data?.eventId;
      if (
        typeof eventId !== 'string' ||
        handledRequestIdentifiers.current.has(requestIdentifier)
      ) {
        return;
      }
      handledRequestIdentifiers.current.add(requestIdentifier);
      router.push({
        pathname: '/(app)/event/[id]',
        params: { id: eventId },
      });
    },
    [router],
  );

  useEffect(() => {
    if (loading || !session) return;

    const coldStartResponse = Notifications.getLastNotificationResponse();
    if (coldStartResponse) {
      openResponse(coldStartResponse);
      Notifications.clearLastNotificationResponse();
    }

    const subscription =
      Notifications.addNotificationResponseReceivedListener(openResponse);
    return () => subscription.remove();
  }, [loading, openResponse, session]);

  return null;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {isAppConfigured ? (
          <AuthProvider>
            <NotificationRedirector />
            <Stack screenOptions={{ headerShown: false }} />
          </AuthProvider>
        ) : (
          <ConfigurationErrorScreen />
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
