import { useEffect } from 'react';
import { Redirect, Stack } from 'expo-router';
import {
  ActivityIndicator,
  AppState,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAuth } from '@/lib/auth';
import { SpaceProvider, useSpace } from '@/lib/space';
import { theme } from '@/lib/colors';
import {
  reconcileLocalReminders,
  registerPushToken,
} from '@/lib/notifications';

function Spinner() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.bg,
      }}
    >
      <ActivityIndicator color={theme.primary} size="large" />
    </View>
  );
}

function Guard({ children }: { children: React.ReactNode }) {
  const { space, loading, error, refresh } = useSpace();
  if (loading) return <Spinner />;
  if (error) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: theme.bg,
        }}
      >
        <Text style={{ color: theme.text, fontSize: 16 }}>{error}</Text>
        <TouchableOpacity onPress={() => void refresh()} style={{ padding: 16 }}>
          <Text style={{ color: theme.primary, fontWeight: '700' }}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (!space) return <Redirect href="/(onboarding)/setup" />;
  return <>{children}</>;
}

function ReminderLifecycle() {
  const { userId } = useAuth();
  const { space, loading } = useSpace();
  const spaceId = space?.id;

  useEffect(() => {
    if (loading || !userId || !spaceId) return;

    const sync = () => {
      void reconcileLocalReminders({ userId, spaceId });
    };
    let previousState = AppState.currentState;
    if (previousState === 'active') sync();

    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && previousState !== 'active') sync();
      previousState = nextState;
    });
    return () => subscription.remove();
  }, [loading, spaceId, userId]);

  return null;
}

export default function AppLayout() {
  const { session, userId, loading } = useAuth();

  useEffect(() => {
    if (userId) void registerPushToken(userId, false);
  }, [userId]);

  if (loading) return <Spinner />;
  if (!session) return <Redirect href="/(auth)/login" />;

  return (
    <SpaceProvider>
      <ReminderLifecycle />
      <Guard>
        <Stack screenOptions={{ headerShown: false }} />
      </Guard>
    </SpaceProvider>
  );
}
