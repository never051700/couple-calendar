import { Alert, ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { parseISO } from 'date-fns';
import ScreenHeader from '@/components/ScreenHeader';
import EventForm, { EventFormValues } from '@/components/EventForm';
import { useAuth } from '@/lib/auth';
import { useSpace } from '@/lib/space';
import { supabase } from '@/lib/supabase';
import { scheduleReminder } from '@/lib/notifications';
import { deviceTimezone, toIso } from '@/lib/time';
import { DEFAULT_MY_COLOR, theme } from '@/lib/colors';

export default function NewEvent() {
  const { userId } = useAuth();
  const { space, me } = useSpace();
  const params = useLocalSearchParams<{ date?: string }>();

  // 선택한 날짜의 다음 정각 ~ +1시간을 기본값으로
  const base = params.date ? parseISO(params.date + 'T09:00:00') : new Date();
  const start = new Date(base);
  if (!params.date) {
    start.setMinutes(0, 0, 0);
    start.setHours(start.getHours() + 1);
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  const initial: EventFormValues = {
    title: '',
    description: '',
    location: '',
    allDay: false,
    start,
    end,
    color: me?.color ?? DEFAULT_MY_COLOR,
    visibility: 'shared',
    reminderMinutes: 30,
  };

  async function onSubmit(v: EventFormValues) {
    if (!space || !userId) throw new Error('공간 정보를 불러오지 못했습니다.');

    const { data, error } = await supabase
      .from('events')
      .insert({
        space_id: space.id,
        owner_id: userId,
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
      .select()
      .single();

    if (error) throw error;

    const reminderResult = await scheduleReminder({
      userId,
      spaceId: space.id,
      eventId: (data as { id: string }).id,
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
      <ScreenHeader title="새 일정" />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <EventForm initial={initial} submitLabel="저장" onSubmit={onSubmit} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
});
