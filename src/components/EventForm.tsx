import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { MEMBER_COLORS, theme } from '@/lib/colors';
import { REMINDER_OPTIONS, allDayBounds } from '@/lib/time';
import { Visibility } from '@/types/db';

export interface EventFormValues {
  title: string;
  description: string;
  location: string;
  allDay: boolean;
  start: Date;
  end: Date;
  color: string;
  visibility: Visibility;
  reminderMinutes: number | null;
}

function fmtDate(d: Date) {
  return format(d, 'M월 d일 (EEE)', { locale: ko });
}
function fmtTime(d: Date) {
  return format(d, 'a h:mm', { locale: ko })
    .replace('AM', '오전')
    .replace('PM', '오후');
}

type PickerTarget = 'startDate' | 'startTime' | 'endDate' | 'endTime' | null;

export default function EventForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial: EventFormValues;
  submitLabel: string;
  onSubmit: (v: EventFormValues) => Promise<void>;
}) {
  const [v, setV] = useState<EventFormValues>(initial);
  const [picker, setPicker] = useState<PickerTarget>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function patch(p: Partial<EventFormValues>) {
    setV((prev) => ({ ...prev, ...p }));
  }

  function toggleAllDay(allDay: boolean) {
    setPicker(null);
    setV((prev) => {
      if (!allDay) return { ...prev, allDay: false };
      const start = allDayBounds(prev.start).start;
      let end = allDayBounds(prev.end).end;
      if (end < start) end = allDayBounds(prev.start).end;
      return { ...prev, allDay: true, start, end };
    });
  }

  function onPickerChange(event: any, date?: Date) {
    // Android: 선택 즉시 닫힘 / dismissed 처리
    if (Platform.OS === 'android') setPicker(null);
    if (event.type === 'dismissed' || !date) return;

    setV((prev) => {
      const next = { ...prev };
      if (picker === 'startDate') {
        const s = prev.allDay
          ? allDayBounds(date).start
          : new Date(prev.start);
        if (!prev.allDay) {
          s.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        }
        next.start = s;
        if (next.end < s) {
          next.end = prev.allDay
            ? allDayBounds(date).end
            : new Date(s.getTime() + 60 * 60 * 1000);
        }
      } else if (picker === 'startTime') {
        const s = new Date(prev.start);
        s.setHours(date.getHours(), date.getMinutes(), 0, 0);
        next.start = s;
        if (next.end <= s) next.end = new Date(s.getTime() + 60 * 60 * 1000);
      } else if (picker === 'endDate') {
        const e = prev.allDay ? allDayBounds(date).end : new Date(prev.end);
        if (!prev.allDay) {
          e.setFullYear(date.getFullYear(), date.getMonth(), date.getDate());
        }
        next.end = e;
      } else if (picker === 'endTime') {
        const e = new Date(prev.end);
        e.setHours(date.getHours(), date.getMinutes(), 0, 0);
        next.end = e;
      }
      return next;
    });
  }

  async function submit() {
    if (!v.title.trim()) {
      setError('제목을 입력해주세요.');
      return;
    }
    if (v.end <= v.start) {
      setError('종료 시각이 시작보다 빠를 수 없어요.');
      return;
    }
    setError(null);
    setBusy(true);
    try {
      await onSubmit(v);
    } catch (e: any) {
      setError(e?.message ?? '저장에 실패했습니다.');
      setBusy(false);
    }
  }

  const pickerValue =
    picker === 'startDate' || picker === 'startTime' ? v.start : v.end;
  const pickerMode =
    picker === 'startDate' || picker === 'endDate' ? 'date' : 'time';

  return (
    <View style={styles.form}>
      <Text style={styles.label}>제목</Text>
      <TextInput
        style={styles.input}
        value={v.title}
        onChangeText={(t) => patch({ title: t })}
        placeholder="일정 제목"
        placeholderTextColor={theme.textMuted}
        accessibilityLabel="일정 제목"
      />

      <Text style={styles.label}>장소</Text>
      <TextInput
        style={styles.input}
        value={v.location}
        onChangeText={(t) => patch({ location: t })}
        placeholder="선택 입력"
        placeholderTextColor={theme.textMuted}
        accessibilityLabel="장소"
      />

      <View style={styles.rowBetween}>
        <Text style={styles.label}>하루 종일</Text>
        <Switch
          value={v.allDay}
          onValueChange={toggleAllDay}
          trackColor={{ true: theme.primary }}
          accessibilityLabel="하루 종일"
        />
      </View>

      {/* 시작 */}
      <Text style={styles.label}>시작</Text>
      <View style={styles.dtRow}>
        <TouchableOpacity
          style={styles.dtBtn}
          onPress={() => setPicker('startDate')}
          accessibilityRole="button"
          accessibilityLabel={`시작 날짜 ${fmtDate(v.start)}`}
        >
          <Text style={styles.dtText}>{fmtDate(v.start)}</Text>
        </TouchableOpacity>
        {!v.allDay && (
          <TouchableOpacity
            style={styles.dtBtn}
            onPress={() => setPicker('startTime')}
            accessibilityRole="button"
            accessibilityLabel={`시작 시간 ${fmtTime(v.start)}`}
          >
            <Text style={styles.dtText}>{fmtTime(v.start)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 종료 */}
      <Text style={styles.label}>종료</Text>
      <View style={styles.dtRow}>
        <TouchableOpacity
          style={styles.dtBtn}
          onPress={() => setPicker('endDate')}
          accessibilityRole="button"
          accessibilityLabel={`종료 날짜 ${fmtDate(v.end)}`}
        >
          <Text style={styles.dtText}>{fmtDate(v.end)}</Text>
        </TouchableOpacity>
        {!v.allDay && (
          <TouchableOpacity
            style={styles.dtBtn}
            onPress={() => setPicker('endTime')}
            accessibilityRole="button"
            accessibilityLabel={`종료 시간 ${fmtTime(v.end)}`}
          >
            <Text style={styles.dtText}>{fmtTime(v.end)}</Text>
          </TouchableOpacity>
        )}
      </View>

      {picker && (
        <DateTimePicker
          value={pickerValue}
          mode={pickerMode}
          is24Hour={false}
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          locale="ko-KR"
          onChange={onPickerChange}
        />
      )}
      {Platform.OS === 'ios' && picker && (
        <TouchableOpacity
          style={styles.pickerDone}
          onPress={() => setPicker(null)}
          accessibilityRole="button"
        >
          <Text style={styles.pickerDoneText}>확인</Text>
        </TouchableOpacity>
      )}

      {/* 색상 */}
      <Text style={styles.label}>색상</Text>
      <View style={styles.colorRow}>
        {MEMBER_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => patch({ color: c })}
            accessibilityRole="radio"
            accessibilityLabel={`색상 ${c}`}
            accessibilityState={{ selected: v.color === c }}
            style={[
              styles.swatch,
              { backgroundColor: c },
              v.color === c && styles.swatchSelected,
            ]}
          />
        ))}
      </View>

      {/* 공개 범위 */}
      <Text style={styles.label}>공개 범위</Text>
      <View style={styles.segment}>
        {(['shared', 'private'] as Visibility[]).map((vis) => (
          <TouchableOpacity
            key={vis}
            style={[styles.segBtn, v.visibility === vis && styles.segBtnActive]}
            onPress={() => patch({ visibility: vis })}
            accessibilityRole="button"
            accessibilityState={{ selected: v.visibility === vis }}
          >
            <Text
              style={[
                styles.segText,
                v.visibility === vis && styles.segTextActive,
              ]}
            >
              {vis === 'shared' ? '공유 (상대도 봄)' : '나만 보기 🔒'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* 알림 */}
      <Text style={styles.label}>알림</Text>
      <View style={styles.chipWrap}>
        {REMINDER_OPTIONS.map((opt) => {
          const active = v.reminderMinutes === opt.value;
          return (
            <TouchableOpacity
              key={String(opt.value)}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => patch({ reminderMinutes: opt.value })}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <Text style={styles.label}>메모</Text>
      <TextInput
        style={[styles.input, styles.textarea]}
        value={v.description}
        onChangeText={(t) => patch({ description: t })}
        placeholder="선택 입력"
        placeholderTextColor={theme.textMuted}
        multiline
        accessibilityLabel="메모"
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.submit, busy && styles.disabled]}
        onPress={submit}
        disabled={busy}
        accessibilityRole="button"
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitText}>{submitLabel}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { padding: 20, paddingBottom: 40, gap: 10 },
  label: { fontSize: 14, fontWeight: '600', color: theme.text, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.card,
  },
  textarea: { minHeight: 80, textAlignVertical: 'top' },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  dtRow: { flexDirection: 'row', gap: 10 },
  dtBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: theme.card,
  },
  dtText: { fontSize: 15, color: theme.text, fontWeight: '600' },
  pickerDone: {
    alignSelf: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  pickerDoneText: { color: theme.primary, fontWeight: '700', fontSize: 15 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  swatch: { width: 44, height: 44, borderRadius: 22 },
  swatchSelected: { borderWidth: 3, borderColor: theme.text },
  segment: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  segBtn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  segBtnActive: { backgroundColor: theme.primary },
  segText: { color: theme.text, fontWeight: '600', fontSize: 13 },
  segTextActive: { color: '#fff' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: theme.card,
  },
  chipActive: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { color: theme.text, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: '700' },
  error: { color: theme.danger, fontSize: 14, marginTop: 4 },
  submit: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  disabled: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
