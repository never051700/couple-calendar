import assert from 'node:assert/strict';
import test from 'node:test';
import {
  allDayBounds,
  dateKey,
  formatDateLong,
  formatRange,
  reminderLabel,
} from '../src/lib/time';

test('dateKey uses a stable local calendar key', () => {
  assert.equal(dateKey(new Date(2026, 6, 23, 12, 30)), '2026-07-23');
});

test('allDayBounds spans the full selected local day', () => {
  const { start, end } = allDayBounds(new Date(2026, 6, 23, 14, 25));
  assert.deepEqual(
    [start.getHours(), start.getMinutes(), start.getSeconds(), start.getMilliseconds()],
    [0, 0, 0, 0],
  );
  assert.deepEqual(
    [end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()],
    [23, 59, 59, 999],
  );
});

test('Korean date formatting includes a Korean weekday', () => {
  assert.match(formatDateLong('2026-07-23T12:00:00.000Z'), /\(목\)/);
});

test('all-day ranges do not expose hidden clock times', () => {
  assert.equal(
    formatRange(
      '2026-07-23T00:00:00.000Z',
      '2026-07-23T23:59:59.999Z',
      true,
    ),
    '하루 종일',
  );
});

test('reminder labels cover null, known and custom values', () => {
  assert.equal(reminderLabel(null), '없음');
  assert.equal(reminderLabel(30), '30분 전');
  assert.equal(reminderLabel(90), '90분 전');
});
