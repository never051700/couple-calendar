import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  router,
  useLocalSearchParams,
  useFocusEffect,
} from 'expo-router';
import ScreenHeader from '@/components/ScreenHeader';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useSpace, colorForOwner, nameForOwner } from '@/lib/space';
import { CalendarEvent } from '@/types/db';
import { formatDateLong, formatRange, reminderLabel } from '@/lib/time';
import { cancelReminder } from '@/lib/notifications';
import { theme } from '@/lib/colors';

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { userId } = useAuth();
  const { members } = useSpace();
  const [event, setEvent] = useState<CalendarEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) {
      setLoadError('일정을 불러오지 못했습니다.');
      setLoading(false);
      return;
    }
    setLoadError(null);
    setEvent((data as CalendarEvent) ?? null);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  function confirmDelete() {
    Alert.alert('일정 삭제', '이 일정을 삭제할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('events').delete().eq('id', id);
          if (error) {
            Alert.alert('삭제 실패', error.message);
            return;
          }
          if (userId) await cancelReminder(userId, id);
          router.back();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="일정" />
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !event) {
    return (
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <ScreenHeader title="일정" />
        <View style={styles.center}>
          <Text style={styles.muted}>
            {loadError ?? '일정을 찾을 수 없어요.'}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const isOwner = event.owner_id === userId;
  const color = event.color ?? colorForOwner(members, event.owner_id);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader
        title="일정"
        right={
          isOwner ? (
            <TouchableOpacity
              onPress={() => router.push(`/(app)/event/edit/${event.id}`)}
            >
              <Text style={styles.edit}>수정</Text>
            </TouchableOpacity>
          ) : null
        }
      />
      <ScrollView contentContainerStyle={styles.body}>
        <View style={styles.titleRow}>
          <View style={[styles.bar, { backgroundColor: color }]} />
          <Text style={styles.title}>{event.title}</Text>
        </View>

        <Row label="날짜" value={formatDateLong(event.starts_at)} />
        <Row
          label="시간"
          value={formatRange(event.starts_at, event.ends_at, event.all_day)}
        />
        <Row
          label="담당"
          value={
            event.owner_id === userId
              ? '나'
              : nameForOwner(members, event.owner_id)
          }
        />
        {event.location ? <Row label="장소" value={event.location} /> : null}
        <Row
          label="공개"
          value={event.visibility === 'private' ? '나만 보기 🔒' : '공유'}
        />
        <Row label="알림" value={reminderLabel(event.reminder_minutes)} />
        {event.description ? (
          <Row label="메모" value={event.description} />
        ) : null}

        {isOwner && (
          <TouchableOpacity style={styles.deleteBtn} onPress={confirmDelete}>
            <Text style={styles.deleteText}>일정 삭제</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  muted: { color: theme.textMuted },
  edit: { color: theme.primary, fontWeight: '700', fontSize: 15 },
  body: { padding: 20, gap: 6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  bar: { width: 6, height: 32, borderRadius: 3 },
  title: { fontSize: 24, fontWeight: '800', color: theme.text, flex: 1 },
  row: {
    flexDirection: 'row',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  rowLabel: { width: 64, color: theme.textMuted, fontSize: 15 },
  rowValue: { flex: 1, color: theme.text, fontSize: 15, fontWeight: '500' },
  deleteBtn: {
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.danger,
    alignItems: 'center',
  },
  deleteText: { color: theme.danger, fontWeight: '700', fontSize: 15 },
});
