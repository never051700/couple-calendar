import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  SectionList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { router, useFocusEffect } from 'expo-router';
import { addDays, parseISO, format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { supabase } from '@/lib/supabase';
import { useSpace, colorForOwner, nameForOwner } from '@/lib/space';
import { SpaceMember, CalendarEvent } from '@/types/db';
import { dateKey, formatRange } from '@/lib/time';
import { theme } from '@/lib/colors';

type ViewMode = 'calendar' | 'list';

LocaleConfig.locales.ko = {
  monthNames: [
    '1월',
    '2월',
    '3월',
    '4월',
    '5월',
    '6월',
    '7월',
    '8월',
    '9월',
    '10월',
    '11월',
    '12월',
  ],
  monthNamesShort: [
    '1월',
    '2월',
    '3월',
    '4월',
    '5월',
    '6월',
    '7월',
    '8월',
    '9월',
    '10월',
    '11월',
    '12월',
  ],
  dayNames: ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'],
  dayNamesShort: ['일', '월', '화', '수', '목', '금', '토'],
  today: '오늘',
};
LocaleConfig.defaultLocale = 'ko';

export default function CalendarScreen() {
  const insets = useSafeAreaInsets();
  const { space, members, me } = useSpace();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [selected, setSelected] = useState<string>(dateKey(new Date()));
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [view, setView] = useState<ViewMode>('calendar');
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!space) return;
    const { data, error } = await supabase
      .from('events')
      .select('*')
      .eq('space_id', space.id)
      .order('starts_at', { ascending: true });
    if (error) {
      setLoadError('일정을 불러오지 못했습니다. 아래로 당겨 다시 시도해주세요.');
      return;
    }
    setLoadError(null);
    setEvents((data as CalendarEvent[]) ?? []);
  }, [space]);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!space) return;
      const channel = supabase
        .channel(`events-${space.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'events',
            filter: `space_id=eq.${space.id}`,
          },
          () => load(),
        )
        .subscribe();
      return () => {
        supabase.removeChannel(channel);
      };
    }, [load, space]),
  );

  const visibleEvents = useMemo(
    () => events.filter((e) => !hidden.has(e.owner_id)),
    [events, hidden],
  );

  const markedDates = useMemo(() => {
    const marks: Record<string, any> = {};
    for (const e of visibleEvents) {
      const color = e.color ?? colorForOwner(members, e.owner_id);
      let cursor = parseISO(e.starts_at);
      const end = parseISO(e.ends_at);
      let guard = 0;
      while (cursor <= end && guard < 60) {
        const key = dateKey(cursor);
        if (!marks[key]) marks[key] = { dots: [] };
        if (!marks[key].dots.some((d: { color: string }) => d.color === color)) {
          marks[key].dots.push({ key: `${e.owner_id}-${color}`, color });
        }
        cursor = addDays(cursor, 1);
        guard += 1;
      }
    }
    marks[selected] = {
      ...(marks[selected] ?? {}),
      selected: true,
      selectedColor: theme.primary + '22',
    };
    return marks;
  }, [visibleEvents, members, selected]);

  const dayEvents = useMemo(() => {
    return visibleEvents
      .filter((e) => {
        const start = dateKey(parseISO(e.starts_at));
        const end = dateKey(parseISO(e.ends_at));
        return selected >= start && selected <= end;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  }, [visibleEvents, selected]);

  // 목록(어젠다) 뷰: 오늘 이후 일정을 날짜별로 그룹
  const upcomingSections = useMemo(() => {
    const todayKey = dateKey(new Date());
    const map: Record<string, CalendarEvent[]> = {};
    for (const e of visibleEvents) {
      const endKey = dateKey(parseISO(e.ends_at));
      if (endKey < todayKey) continue;
      const startKey = dateKey(parseISO(e.starts_at));
      const key = startKey < todayKey ? todayKey : startKey;
      (map[key] ??= []).push(e);
    }
    return Object.keys(map)
      .sort()
      .map((k) => ({
        title: k,
        data: map[k].sort((a, b) => a.starts_at.localeCompare(b.starts_at)),
      }));
  }, [visibleEvents]);

  function toggleMember(userId: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const refreshControl = (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
      }}
    />
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <Text style={styles.appTitle}>{space?.name ?? '우리 캘린더'}</Text>
        <View style={styles.topRight}>
          {view === 'calendar' && (
            <TouchableOpacity
              style={styles.todayBtn}
              onPress={() => setSelected(dateKey(new Date()))}
              accessibilityRole="button"
              accessibilityLabel="오늘로 이동"
            >
              <Text style={styles.todayText}>오늘</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.push('/(app)/settings')}
            accessibilityRole="button"
            accessibilityLabel="설정 열기"
          >
            <Text style={styles.gear}>⚙️</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 뷰 전환 */}
      <View style={styles.viewToggle}>
        {(['calendar', 'list'] as ViewMode[]).map((v) => (
          <TouchableOpacity
            key={v}
            style={[styles.toggleBtn, view === v && styles.toggleActive]}
            onPress={() => setView(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: view === v }}
          >
            <Text style={[styles.toggleText, view === v && styles.toggleTextActive]}>
              {v === 'calendar' ? '달력' : '목록'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 멤버 색상 범례 = 필터 */}
      <View style={styles.legend}>
        {members.map((m) => {
          const off = hidden.has(m.user_id);
          return (
            <TouchableOpacity
              key={m.user_id}
              style={[styles.legendChip, off && styles.legendOff]}
              onPress={() => toggleMember(m.user_id)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: !off }}
              accessibilityLabel={`${
                m.user_id === me?.user_id
                  ? '나'
                  : m.profile?.display_name ?? '친구'
              } 일정 표시`}
            >
              <View style={[styles.dot, { backgroundColor: m.color }]} />
              <Text style={[styles.legendText, off && styles.legendTextOff]}>
                {m.user_id === me?.user_id ? '나' : m.profile?.display_name ?? '친구'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loadError ? <Text style={styles.loadError}>{loadError}</Text> : null}

      {view === 'calendar' ? (
        <>
          <Calendar
            key={selected.slice(0, 7)}
            current={selected}
            onDayPress={(d: { dateString: string }) => setSelected(d.dateString)}
            markingType="multi-dot"
            markedDates={markedDates}
            firstDay={0}
            theme={{
              todayTextColor: theme.primary,
              arrowColor: theme.primary,
              textMonthFontWeight: '700',
            }}
          />
          <FlatList
            style={styles.list}
            contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
            data={dayEvents}
            keyExtractor={(e) => e.id}
            refreshControl={refreshControl}
            ListEmptyComponent={
              <Text style={styles.empty}>이 날에는 일정이 없어요.</Text>
            }
            renderItem={({ item }) => (
              <EventRow item={item} members={members} meId={me?.user_id} />
            )}
          />
        </>
      ) : (
        <SectionList
          style={styles.list}
          contentContainerStyle={{ paddingBottom: insets.bottom + 96 }}
          sections={upcomingSections}
          keyExtractor={(e) => e.id}
          refreshControl={refreshControl}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            <Text style={styles.empty}>다가오는 일정이 없어요.</Text>
          }
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>
              {format(parseISO(section.title + 'T00:00:00'), 'M월 d일 (EEE)', {
                locale: ko,
              })}
            </Text>
          )}
          renderItem={({ item }) => (
            <EventRow item={item} members={members} meId={me?.user_id} />
          )}
        />
      )}

      <TouchableOpacity
        style={[styles.fab, { bottom: insets.bottom + 16 }]}
        onPress={() =>
          router.push({
            pathname: '/(app)/event/new',
            params: { date: selected },
          })
        }
        accessibilityRole="button"
        accessibilityLabel="새 일정 추가"
      >
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

function EventRow({
  item,
  members,
  meId,
}: {
  item: CalendarEvent;
  members: SpaceMember[];
  meId?: string;
}) {
  const color = item.color ?? colorForOwner(members, item.owner_id);
  return (
    <TouchableOpacity
      style={styles.eventCard}
      onPress={() => router.push(`/(app)/event/${item.id}`)}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${formatRange(
        item.starts_at,
        item.ends_at,
        item.all_day,
      )}`}
    >
      <View style={[styles.eventBar, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.eventTitle}>
          {item.visibility === 'private' ? '🔒 ' : ''}
          {item.title}
        </Text>
        <Text style={styles.eventTime}>
          {formatRange(item.starts_at, item.ends_at, item.all_day)}
        </Text>
        <Text style={styles.eventOwner}>
          {item.owner_id === meId ? '나' : nameForOwner(members, item.owner_id)}
          {item.location ? ` · ${item.location}` : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  appTitle: { fontSize: 20, fontWeight: '700', color: theme.text },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  todayBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 5,
  },
  todayText: { color: theme.primary, fontWeight: '700', fontSize: 13 },
  gear: { fontSize: 22 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewToggle: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 10,
    marginHorizontal: 16,
    marginBottom: 8,
    padding: 3,
    borderWidth: 1,
    borderColor: theme.border,
  },
  toggleBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
  toggleActive: { backgroundColor: theme.primary },
  toggleText: { color: theme.text, fontWeight: '600', fontSize: 14 },
  toggleTextActive: { color: '#fff' },
  legend: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
    flexWrap: 'wrap',
  },
  legendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.card,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: theme.border,
    minHeight: 44,
  },
  legendOff: { opacity: 0.4 },
  dot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: 13, color: theme.text, fontWeight: '600' },
  legendTextOff: { textDecorationLine: 'line-through' },
  list: { flex: 1, paddingHorizontal: 16 },
  loadError: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 10,
    padding: 10,
    color: theme.danger,
    backgroundColor: '#FEF2F2',
    fontSize: 13,
  },
  empty: { textAlign: 'center', color: theme.textMuted, marginTop: 32 },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: theme.textMuted,
    marginTop: 16,
    marginBottom: 4,
  },
  eventCard: {
    flexDirection: 'row',
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginVertical: 5,
    borderWidth: 1,
    borderColor: theme.border,
    gap: 12,
  },
  eventBar: { width: 5, borderRadius: 3 },
  eventTitle: { fontSize: 16, fontWeight: '700', color: theme.text },
  eventTime: { fontSize: 14, color: theme.text, marginTop: 3 },
  eventOwner: { fontSize: 12, color: theme.textMuted, marginTop: 3 },
  fab: {
    position: 'absolute',
    right: 22,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  fabText: { color: '#fff', fontSize: 32, marginTop: -2 },
});
