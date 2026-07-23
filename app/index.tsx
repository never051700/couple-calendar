import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/colors';

type SpaceCheck = 'loading' | 'none' | 'has' | 'error';

export default function Index() {
  const { session, userId, loading } = useAuth();
  const [check, setCheck] = useState<SpaceCheck>('loading');
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!userId) {
        setCheck('none');
        return;
      }
      setCheck('loading');
      const { data, error } = await supabase
        .from('space_members')
        .select('space_id')
        .eq('user_id', userId)
        .limit(1);
      if (!active) return;
      if (error) {
        setCheck('error');
        return;
      }
      setCheck(data && data.length > 0 ? 'has' : 'none');
    })();
    return () => {
      active = false;
    };
  }, [retryCount, userId]);

  if (loading || (session && check === 'loading')) {
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

  if (!session) return <Redirect href="/(auth)/login" />;
  if (check === 'error') {
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
        <Text style={{ color: theme.text, fontSize: 16, textAlign: 'center' }}>
          캘린더 정보를 불러오지 못했습니다.
        </Text>
        <TouchableOpacity
          style={{ marginTop: 16, padding: 12 }}
          onPress={() => setRetryCount((count) => count + 1)}
        >
          <Text style={{ color: theme.primary, fontWeight: '700' }}>다시 시도</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (check === 'none') return <Redirect href="/(onboarding)/setup" />;
  return <Redirect href="/(app)/calendar" />;
}
