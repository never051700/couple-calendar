import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { parseISO } from 'date-fns';
import { supabase } from './supabase';

// 포그라운드에서도 알림 배너 표시
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export type PushRegistrationResult =
  | 'registered'
  | 'simulator'
  | 'permission-denied'
  | 'project-unlinked'
  | 'error';

export type ReminderScheduleResult =
  | 'scheduled'
  | 'disabled'
  | 'past'
  | 'permission-denied'
  | 'error';

export type ReminderReconciliationResult =
  | 'synced'
  | 'permission-denied'
  | 'error';

const REMINDER_KIND = 'event-reminder';
const MAX_RECONCILED_REMINDERS = 60;
const DEFAULT_NOTIFICATION_CHANNEL_ID = 'default';

interface ReminderTarget {
  eventId: string;
  userId: string;
  spaceId: string;
  title: string;
  startsAtIso: string;
  reminderMinutes: number;
  fireDate: Date;
  identifier: string;
  fingerprint: string;
}

interface ReminderEventRow {
  id: string;
  title: string;
  starts_at: string;
  reminder_minutes: number | null;
}

// Foreground reconciliation and local CRUD can otherwise cancel each other's
// work. Serialize every local-reminder mutation for the same signed-in user.
const reminderQueues = new Map<string, Promise<unknown>>();

function withReminderLock<T>(
  userId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = reminderQueues.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(work);
  reminderQueues.set(userId, current);
  void current
    .finally(() => {
      if (reminderQueues.get(userId) === current) {
        reminderQueues.delete(userId);
      }
    })
    .catch(() => undefined);
  return current;
}

function notificationsAllowed(
  permission: Notifications.NotificationPermissionsStatus,
): boolean {
  if (permission.granted) return true;
  const iosStatus = permission.ios?.status;
  return (
    iosStatus === Notifications.IosAuthorizationStatus.AUTHORIZED ||
    iosStatus === Notifications.IosAuthorizationStatus.PROVISIONAL ||
    iosStatus === Notifications.IosAuthorizationStatus.EPHEMERAL
  );
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(
    DEFAULT_NOTIFICATION_CHANNEL_ID,
    {
      name: '일정 알림',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#3B82F6',
    },
  );
}

async function ensureNotificationPermission(
  requestIfNeeded: boolean,
): Promise<boolean> {
  await ensureAndroidNotificationChannel();
  const existing = await Notifications.getPermissionsAsync();
  if (notificationsAllowed(existing)) return true;
  if (!requestIfNeeded || !existing.canAskAgain) return false;

  const requested = await Notifications.requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  });
  return notificationsAllowed(requested);
}

function easProjectId(): string | null {
  const value =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  return typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)
    ? value
    : null;
}

function pushTokenStorageKey(userId: string): string {
  return `push_token_v2:${userId}`;
}

const PENDING_PUSH_CLEANUP_KEY = 'push_token_cleanup_v1';

interface PendingPushCleanup {
  userId: string;
  token: string;
  queuedAt: string;
}

async function loadPendingPushCleanup(): Promise<PendingPushCleanup[]> {
  const raw = await AsyncStorage.getItem(PENDING_PUSH_CLEANUP_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PendingPushCleanup =>
        typeof item === 'object' &&
        item != null &&
        typeof (item as PendingPushCleanup).userId === 'string' &&
        typeof (item as PendingPushCleanup).token === 'string' &&
        typeof (item as PendingPushCleanup).queuedAt === 'string',
    );
  } catch {
    return [];
  }
}

async function savePendingPushCleanup(
  pending: PendingPushCleanup[],
): Promise<void> {
  if (pending.length === 0) {
    await AsyncStorage.removeItem(PENDING_PUSH_CLEANUP_KEY);
    return;
  }
  await AsyncStorage.setItem(PENDING_PUSH_CLEANUP_KEY, JSON.stringify(pending));
}

async function rememberPendingPushCleanup(
  userId: string,
  token: string,
): Promise<void> {
  const pending = await loadPendingPushCleanup();
  if (!pending.some((item) => item.token === token)) {
    pending.push({ userId, token, queuedAt: new Date().toISOString() });
  }
  await savePendingPushCleanup(pending);
}

async function forgetPendingPushCleanup(token: string): Promise<void> {
  const pending = await loadPendingPushCleanup();
  await savePendingPushCleanup(pending.filter((item) => item.token !== token));
}

async function removeStoredPushTokenIfMatches(
  userId: string,
  token: string,
): Promise<void> {
  const key = pushTokenStorageKey(userId);
  if ((await AsyncStorage.getItem(key)) === token) {
    await AsyncStorage.removeItem(key);
  }
}

async function unregisterPushToken(token: string): Promise<boolean> {
  try {
    const { error } = await supabase.rpc('unregister_push_token', {
      _token: token,
    });
    if (error) {
      console.warn('[push] token unregister failed:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.warn('[push] token unregister failed:', error);
    return false;
  }
}

// A successful claim always happens before this retry. Therefore a pending
// entry for the active token is stale and must be forgotten, not unregistered.
async function retryPendingPushCleanup(
  currentUserId: string,
  activeToken: string,
): Promise<void> {
  const pending = await loadPendingPushCleanup();
  if (pending.length === 0) return;

  const remaining: PendingPushCleanup[] = [];
  for (const item of pending) {
    if (item.token === activeToken) {
      if (item.userId !== currentUserId) {
        await removeStoredPushTokenIfMatches(item.userId, item.token);
      }
      continue;
    }

    if (await unregisterPushToken(item.token)) {
      await removeStoredPushTokenIfMatches(item.userId, item.token);
    } else {
      remaining.push(item);
    }
  }
  await savePendingPushCleanup(remaining);
}

// 푸시 토큰은 프로필과 분리해 여러 기기별로 저장합니다.
export async function registerPushToken(
  userId: string,
  requestPermission = true,
): Promise<PushRegistrationResult> {
  if (!Device.isDevice) {
    return 'simulator';
  }

  try {
    if (!(await ensureNotificationPermission(requestPermission))) {
      return 'permission-denied';
    }

    const projectId = easProjectId();
    if (!projectId) return 'project-unlinked';

    const tokenResp = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenResp.data;

    const { error } = await supabase.rpc('register_push_token', {
      _token: token,
      _platform: Platform.OS,
    });
    if (error) throw error;

    try {
      await AsyncStorage.setItem(pushTokenStorageKey(userId), token);
    } catch (storageError) {
      if (!(await unregisterPushToken(token))) {
        try {
          await rememberPendingPushCleanup(userId, token);
        } catch (pendingError) {
          console.warn('[push] failed to preserve cleanup retry:', pendingError);
        }
      }
      throw storageError;
    }

    try {
      await retryPendingPushCleanup(userId, token);
    } catch (cleanupError) {
      // Registration is already correct. Keep pending work for the next launch.
      console.warn('[push] pending cleanup retry failed:', cleanupError);
    }
    return 'registered';
  } catch (e) {
    console.warn('[push] 토큰 발급 실패:', e);
    return 'error';
  }
}

// ---------- 로컬 리마인더 (서버 없이 기기에서 예약) ----------
// 이벤트별 예약 알림 id 를 AsyncStorage 에 저장해 갱신/취소 관리
const LEGACY_REMINDER_MAP_KEY = 'reminder_map_v1';

function reminderMapKey(userId: string): string {
  return `reminder_map_v2:${userId}`;
}

async function loadMap(userId: string): Promise<Record<string, string>> {
  const raw = await AsyncStorage.getItem(reminderMapKey(userId));
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return {};
  }
}
async function saveMap(
  userId: string,
  map: Record<string, string>,
): Promise<void> {
  await AsyncStorage.setItem(reminderMapKey(userId), JSON.stringify(map));
}

function reminderIdentifier(userId: string, eventId: string): string {
  return `${REMINDER_KIND}:${userId}:${eventId}`;
}

function reminderFingerprint(
  title: string,
  startsAtIso: string,
  reminderMinutes: number,
): string {
  return JSON.stringify([title, startsAtIso, reminderMinutes]);
}

function makeReminderTarget(params: {
  userId: string;
  spaceId: string;
  eventId: string;
  title: string;
  startsAtIso: string;
  reminderMinutes: number;
}): ReminderTarget | null {
  const startsAt = parseISO(params.startsAtIso).getTime();
  const fireAt = startsAt - params.reminderMinutes * 60 * 1000;
  if (!Number.isFinite(fireAt) || fireAt <= Date.now()) return null;

  return {
    ...params,
    fireDate: new Date(fireAt),
    identifier: reminderIdentifier(params.userId, params.eventId),
    fingerprint: reminderFingerprint(
      params.title,
      params.startsAtIso,
      params.reminderMinutes,
    ),
  };
}

function isManagedReminderForUser(
  request: Notifications.NotificationRequest,
  userId: string,
): boolean {
  const data = request.content.data;
  return data?.kind === REMINDER_KIND && data?.userId === userId;
}

async function scheduleManagedReminder(
  target: ReminderTarget,
): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    identifier: target.identifier,
    content: {
      title: '📅 일정 알림',
      body: target.title,
      sound: true,
      data: {
        kind: REMINDER_KIND,
        userId: target.userId,
        spaceId: target.spaceId,
        eventId: target.eventId,
        fingerprint: target.fingerprint,
      },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: target.fireDate,
      channelId: DEFAULT_NOTIFICATION_CHANNEL_ID,
    },
  });
}

async function cancelReminderUnlocked(
  userId: string,
  eventId: string,
): Promise<void> {
  const map = await loadMap(userId);
  const ids = new Set([reminderIdentifier(userId, eventId)]);
  if (map[eventId]) ids.add(map[eventId]);

  await Promise.all(
    [...ids].map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // 이미 발송/취소된 경우 무시
      }
    }),
  );

  if (map[eventId]) {
    try {
      delete map[eventId];
      await saveMap(userId, map);
    } catch (error) {
      console.warn('[notification] reminder metadata update failed:', error);
    }
  }
}

export function cancelReminder(
  userId: string,
  eventId: string,
): Promise<void> {
  return withReminderLock(userId, () =>
    cancelReminderUnlocked(userId, eventId),
  );
}

async function cancelMap(map: Record<string, string>): Promise<void> {
  await Promise.all(
    Object.values(map).map(async (id) => {
      try {
        await Notifications.cancelScheduledNotificationAsync(id);
      } catch {
        // 이미 발송된 알림은 별도 정리가 필요하지 않습니다.
      }
    }),
  );
}

async function clearNotificationDataUnlocked(userId: string): Promise<void> {
  let map: Record<string, string> = {};
  let legacyRaw: string | null = null;
  let token: string | null = null;
  let scheduledRequests: Notifications.NotificationRequest[] = [];
  try {
    [map, legacyRaw, token] = await Promise.all([
      loadMap(userId),
      AsyncStorage.getItem(LEGACY_REMINDER_MAP_KEY),
      AsyncStorage.getItem(pushTokenStorageKey(userId)),
    ]);
  } catch (storageError) {
    // Logout must still proceed. Any server token whose local lookup failed can
    // be reclaimed by register_push_token when this device next signs in.
    console.warn('[notification] logout data lookup failed:', storageError);
  }

  try {
    scheduledRequests = await Notifications.getAllScheduledNotificationsAsync();
  } catch (notificationError) {
    console.warn(
      '[notification] scheduled reminder lookup failed:',
      notificationError,
    );
  }

  let legacyMap: Record<string, string> = {};
  try {
    legacyMap = legacyRaw ? JSON.parse(legacyRaw) : {};
  } catch {
    legacyMap = {};
  }
  const managedMap = Object.fromEntries(
    scheduledRequests
      .filter((request) => isManagedReminderForUser(request, userId))
      .map((request) => [request.identifier, request.identifier]),
  );
  await Promise.all([cancelMap(map), cancelMap(legacyMap), cancelMap(managedMap)]);

  let nativeUnregistered = false;
  try {
    await Notifications.unregisterForNotificationsAsync();
    nativeUnregistered = true;
  } catch (nativeError) {
    // APNs/FCM unregister is the immediate offline privacy boundary. Preserve
    // the token retry record below if the native operation cannot complete.
    console.warn('[push] native notification unregister failed:', nativeError);
  }

  const serverUnregistered = token ? await unregisterPushToken(token) : true;
  if (token && serverUnregistered && nativeUnregistered) {
    try {
      await Promise.all([
        removeStoredPushTokenIfMatches(userId, token),
        forgetPendingPushCleanup(token),
      ]);
    } catch (storageError) {
      console.warn('[push] local token cleanup failed:', storageError);
    }
  } else if (token) {
    try {
      // Keep both the device-scoped token key and an explicit retry record.
      // A later login can safely unregister it or claim the new active token.
      await rememberPendingPushCleanup(userId, token);
    } catch (storageError) {
      console.warn('[push] failed to queue token cleanup:', storageError);
    }
  }

  try {
    await AsyncStorage.multiRemove([
      reminderMapKey(userId),
      LEGACY_REMINDER_MAP_KEY,
    ]);
  } catch (storageError) {
    console.warn('[notification] reminder metadata cleanup failed:', storageError);
  }
}

export function clearNotificationData(userId: string): Promise<void> {
  return withReminderLock(userId, () => clearNotificationDataUnlocked(userId));
}

export async function openNotificationSettings(): Promise<void> {
  await Linking.openSettings();
}

// 이벤트 저장 시 호출: 기존 예약 취소 후 재예약
export async function scheduleReminder(params: {
  userId: string;
  spaceId: string;
  eventId: string;
  title: string;
  startsAtIso: string;
  reminderMinutes: number | null;
}): Promise<ReminderScheduleResult> {
  return withReminderLock(params.userId, async () => {
    const {
      userId,
      spaceId,
      eventId,
      title,
      startsAtIso,
      reminderMinutes,
    } = params;
    let scheduledId: string | null = null;

    try {
      await cancelReminderUnlocked(userId, eventId);
      if (reminderMinutes == null) return 'disabled';
      if (!(await ensureNotificationPermission(true))) {
        return 'permission-denied';
      }

      const target = makeReminderTarget({
        userId,
        spaceId,
        eventId,
        title,
        startsAtIso,
        reminderMinutes,
      });
      // 이미 지난 시각이면 예약하지 않음
      if (!target) return 'past';

      scheduledId = await scheduleManagedReminder(target);

      const map = await loadMap(userId);
      map[eventId] = scheduledId;
      await saveMap(userId, map);
      return 'scheduled';
    } catch (e) {
      if (scheduledId) {
        try {
          await Notifications.cancelScheduledNotificationAsync(scheduledId);
        } catch {
          // The OS may already have removed or delivered it.
        }
      }
      console.warn('[notification] 로컬 알림 예약 실패:', e);
      return 'error';
    }
  });
}

// Rebuild this device's owned-event reminders from the current server state.
// Automatic foreground sync never asks for permission and never treats a
// network/RLS failure as an empty calendar, so working reminders are preserved
// while the device is offline.
export function reconcileLocalReminders(params: {
  userId: string;
  spaceId: string;
}): Promise<ReminderReconciliationResult> {
  const { userId, spaceId } = params;

  return withReminderLock(userId, async () => {
    try {
      if (!(await ensureNotificationPermission(false))) {
        return 'permission-denied';
      }

      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from('events')
        .select('id, title, starts_at, reminder_minutes')
        .eq('space_id', spaceId)
        .eq('owner_id', userId)
        .not('reminder_minutes', 'is', null)
        .gt('starts_at', nowIso);
      if (error) throw error;

      const targets = ((data as ReminderEventRow[] | null) ?? [])
        .flatMap((event) => {
          const minutes = event.reminder_minutes;
          if (minutes == null || !Number.isFinite(minutes) || minutes < 0) {
            return [];
          }
          const target = makeReminderTarget({
            userId,
            spaceId,
            eventId: event.id,
            title: event.title,
            startsAtIso: event.starts_at,
            reminderMinutes: minutes,
          });
          return target ? [target] : [];
        })
        .sort((a, b) => a.fireDate.getTime() - b.fireDate.getTime())
        .slice(0, MAX_RECONCILED_REMINDERS);

      // Finish every fallible read before changing OS reservations. This keeps
      // the current reminder set intact when native storage is unavailable.
      const [scheduledRequests, map, legacyRaw] = await Promise.all([
        Notifications.getAllScheduledNotificationsAsync(),
        loadMap(userId),
        AsyncStorage.getItem(LEGACY_REMINDER_MAP_KEY),
      ]);

      let legacyMap: Record<string, string> = {};
      try {
        legacyMap = legacyRaw ? JSON.parse(legacyRaw) : {};
      } catch {
        legacyMap = {};
      }

      const remainingTargets = new Map(
        targets.map((target) => [target.identifier, target]),
      );
      const nextMap: Record<string, string> = {};
      const keepIdentifiers = new Set<string>();
      const identifiersToCancel = new Set<string>();

      for (const request of scheduledRequests) {
        const requestData = request.content.data;

        if (requestData?.kind === REMINDER_KIND) {
          if (requestData.userId !== userId) {
            // Only one account is active on a device. Remove reminders left by
            // an interrupted logout so another user's event cannot surface.
            identifiersToCancel.add(request.identifier);
            continue;
          }

          const target = remainingTargets.get(request.identifier);
          if (
            target &&
            requestData.spaceId === spaceId &&
            requestData.fingerprint === target.fingerprint
          ) {
            keepIdentifiers.add(request.identifier);
            nextMap[target.eventId] = request.identifier;
            remainingTargets.delete(request.identifier);
          } else {
            identifiersToCancel.add(request.identifier);
          }
          continue;
        }

        // Older app versions stored only eventId in local notification data.
        // Scheduled push notifications are not returned by this native API.
        if (typeof requestData?.eventId === 'string') {
          identifiersToCancel.add(request.identifier);
        }
      }

      for (const identifier of [
        ...Object.values(map),
        ...Object.values(legacyMap),
      ]) {
        if (!keepIdentifiers.has(identifier)) {
          identifiersToCancel.add(identifier);
        }
      }

      await Promise.all(
        [...identifiersToCancel].map(async (identifier) => {
          try {
            await Notifications.cancelScheduledNotificationAsync(identifier);
          } catch {
            // It may have fired between the pending lookup and cancellation.
          }
        }),
      );

      let schedulingFailed = false;
      for (const target of remainingTargets.values()) {
        try {
          const identifier = await scheduleManagedReminder(target);
          nextMap[target.eventId] = identifier;
        } catch (scheduleError) {
          schedulingFailed = true;
          console.warn(
            '[notification] reminder reconciliation schedule failed:',
            scheduleError,
          );
        }
      }

      await Promise.all([
        saveMap(userId, nextMap),
        AsyncStorage.removeItem(LEGACY_REMINDER_MAP_KEY),
      ]);
      return schedulingFailed ? 'error' : 'synced';
    } catch (reconciliationError) {
      console.warn(
        '[notification] reminder reconciliation failed:',
        reconciliationError,
      );
      return 'error';
    }
  });
}
