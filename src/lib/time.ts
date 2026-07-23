import { format, parseISO } from 'date-fns';
import { ko } from 'date-fns/locale';

// 로컬 날짜 키 (YYYY-MM-DD) — react-native-calendars 의 dateString 과 맞춤
export function dateKey(d: Date): string {
  return format(d, 'yyyy-MM-dd', { locale: ko });
}

export function isoToDateKey(iso: string): string {
  return format(parseISO(iso), 'yyyy-MM-dd', { locale: ko });
}

// 표시용 포맷
export function formatTime(iso: string): string {
  return format(parseISO(iso), 'a h:mm', { locale: ko })
    .replace('AM', '오전')
    .replace('PM', '오후');
}

export function formatDateLong(iso: string): string {
  return format(parseISO(iso), 'yyyy년 M월 d일 (EEE)', { locale: ko });
}

export function formatRange(startIso: string, endIso: string, allDay: boolean): string {
  if (allDay) return '하루 종일';
  const start = parseISO(startIso);
  const end = parseISO(endIso);
  const sameDay = dateKey(start) === dateKey(end);
  if (sameDay) {
    return `${formatTime(startIso)} - ${format(end, 'a h:mm', { locale: ko }).replace('AM', '오전').replace('PM', '오후')}`;
  }
  return `${formatDateLong(startIso)} ${formatTime(startIso)}\n~ ${formatDateLong(endIso)} ${formatTime(endIso)}`;
}

// Date -> ISO(UTC) 문자열
export function toIso(d: Date): string {
  return d.toISOString();
}

// 현재 기기 시간대
export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul';
  } catch {
    return 'Asia/Seoul';
  }
}

// 종일 일정 기본 시작/종료 (해당 날짜 00:00 ~ 23:59 로컬)
export function allDayBounds(d: Date): { start: Date; end: Date } {
  const start = new Date(d);
  start.setHours(0, 0, 0, 0);
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

const REMINDER_LABELS: Record<number, string> = {
  0: '일정 시작 시각',
  10: '10분 전',
  30: '30분 전',
  60: '1시간 전',
  1440: '1일 전',
};

export const REMINDER_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: '없음' },
  { value: 0, label: '일정 시작 시각' },
  { value: 10, label: '10분 전' },
  { value: 30, label: '30분 전' },
  { value: 60, label: '1시간 전' },
  { value: 1440, label: '1일 전' },
];

export function reminderLabel(minutes: number | null): string {
  if (minutes == null) return '없음';
  return REMINDER_LABELS[minutes] ?? `${minutes}분 전`;
}
