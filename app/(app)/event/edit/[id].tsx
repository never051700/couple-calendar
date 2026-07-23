import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View, ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { parseISO } from 'date-fns';
import ScreenHeader from '@/components/ScreenHeader';
import EventForm, { EventFormValues } from '@/components/EventForm';
import { supabase } from '@/lib/supabase';
import { scheduleReminder } from '@/lib/notifications';
import { deviceTimezone, toIso } from '@/lib/time';
import { CalendarEvent } from '@/types/db';
import { theme } from '@/lib/colors';
import { useAuth } from '@/lib/auth';
import { useSpace } from '@/lib/space';

export default function EditEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { space } = useSpace();
  const [initial, setInitial] = useState<EventFormValues | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    setInitial(null);
    setLoadError(null);
    (async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) {
        setLoadError('일정을 불러오지 못했습니다.');
        return;
      }
      const e = data as CalendarEvent | null;
      if (!e) {
        setLoadError('일정을 찾을 수 없습니다.');
        return;
      }
      if (e.owner_id !== userId) {
        setLoadError('내가 만든 일정만 수정할 수 있습니다.');
        return;
      }
      setLoadError(null);
      setInitial({
        title: e.title,
        description: e.description ?? '',
        location: e.location ?? '',
        allDay: e.all_day,
        start: parseISO(e.starts_at),
        end: parseISO(e.ends_at),
        color: e.color ?? theme.primary,
        visibility: e.visibility,
        reminderMinutes: e.reminder_minutes,
      });
    })();
  }, [id, userId]);

  async function onSubmit(v: EventFormValues) {
    if (!userId || !space) {
      throw new Error('캘린더 정보를 불러오지 못했습니다.');
    }
    const { data, error } = await supabase
      .from('events')
      .update({
        title: v.title.trim(),
        description: v.description.trim() || null,
        location: v.location.trim() || null,
        starts_at: toIso(v.start),
        ends_at: toIso(v.end),
        all_day: v.allDay,
        timezone: deviceTimezone(),
        color: v.color,
        visibility: v.visibility,
        reminder_minutes: v.reminderMinutes,
      })
      .eq('id', id)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('수정 권한이 없거나 일정이 삭제되었습니다.');

    const reminderResult = await scheduleReminder({
      userId,
      spaceId: space.id,
      eventId: id,
      title: v.title.trim(),
      startsAtIso: toIso(v.start),
      reminderMinutes: v.reminderMinutes,
    });

    if (reminderResult === 'permission-denied') {
      Alert.alert(
        '일정은 저장됐어요',
        '알림 권한이 꺼져 있어 리마인더는 예약하지 못했습니다. 설정에서 알림을 켤 수 있어요.',
      );
    } else if (reminderResult === 'error') {
      Alert.alert('일정은 저장됐어요', '리마인더 예약만 실패했습니다.');
    }

    router.back();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="일정 수정" />
      {loadError ? (
        <View style={styles.center}>
          <Text style={styles.error}>{loadError}</Text>
        </View>
      ) : initial ? (
        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <EventForm initial={initial} submitLabel="수정 저장" onSubmit={onSubmit} />
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: theme.textMuted, fontSize: 15 },
});
