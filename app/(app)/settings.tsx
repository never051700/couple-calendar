import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
  Share,
  Linking,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import ScreenHeader from '@/components/ScreenHeader';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { useSpace } from '@/lib/space';
import {
  openNotificationSettings,
  reconcileLocalReminders,
  registerPushToken,
} from '@/lib/notifications';
import { MEMBER_COLORS, theme } from '@/lib/colors';
import { privacyPolicyUrl, supportUrl } from '@/lib/config';

export default function Settings() {
  const { userId, signOut, deleteAccount } = useAuth();
  const { space, me, partner, refresh } = useSpace();

  const [name, setName] = useState('');
  const [color, setColor] = useState(me?.color ?? MEMBER_COLORS[0]);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notificationBusy, setNotificationBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setName(me?.profile?.display_name ?? '');
    setColor(me?.color ?? MEMBER_COLORS[0]);
  }, [me]);

  async function saveName() {
    if (!userId) return;
    const { error } = await supabase
      .from('profiles')
      .update({ display_name: name.trim() || null })
      .eq('id', userId);
    if (error) {
      Alert.alert('저장 실패', error.message);
      return;
    }
    await refresh();
    Alert.alert('저장됨', '이름이 변경되었어요.');
  }

  async function saveColor(c: string) {
    if (!space || !userId) return;
    const previous = color;
    setColor(c);
    const { error } = await supabase.rpc('update_my_member_color', {
      _space_id: space.id,
      _color: c,
    });
    if (error) {
      setColor(previous);
      Alert.alert('저장 실패', error.message);
      return;
    }
    await refresh();
  }

  async function makeInvite() {
    if (!space) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('create_invite', {
      _space_id: space.id,
    });
    setBusy(false);
    if (error) {
      Alert.alert('오류', error.message);
      return;
    }
    setCode(data as string);
  }

  async function shareInvite() {
    if (!code) return;
    await Share.share({
      message: `우리 캘린더에 참여해줘! 앱에서 초대 코드 [${code}] 를 입력하면 돼. (7일 내 유효)`,
    });
  }

  function confirmSignOut() {
    Alert.alert('로그아웃', '로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          try {
            await signOut();
            router.replace('/(auth)/login');
          } catch (error) {
            Alert.alert(
              '로그아웃 실패',
              error instanceof Error ? error.message : '다시 시도해주세요.',
            );
          }
        },
      },
    ]);
  }

  async function enableNotifications() {
    if (!userId) return;
    setNotificationBusy(true);
    const result = await registerPushToken(userId, true);
    setNotificationBusy(false);

    if (
      space &&
      result !== 'permission-denied' &&
      result !== 'simulator'
    ) {
      void reconcileLocalReminders({ userId, spaceId: space.id });
    }

    if (result === 'registered') {
      Alert.alert('등록됨', '이 기기에서 푸시 알림을 받을 수 있어요.');
    } else if (result === 'permission-denied') {
      Alert.alert('알림 권한 필요', '기기 설정에서 알림을 허용해주세요.', [
        { text: '취소', style: 'cancel' },
        { text: '설정 열기', onPress: () => void openNotificationSettings() },
      ]);
    } else if (result === 'project-unlinked') {
      Alert.alert('앱 연결 필요', '먼저 EAS 프로젝트를 연결해주세요.');
    } else if (result === 'simulator') {
      Alert.alert('실기기 필요', '원격 푸시는 실제 휴대폰에서 등록할 수 있어요.');
    } else {
      Alert.alert('등록 실패', '네트워크와 백엔드 설정을 확인해주세요.');
    }
  }

  async function openInfoPage(
    url: string | null,
    title: string,
  ): Promise<void> {
    if (!url) {
      Alert.alert(
        `${title} 준비 중`,
        `아직 ${title} 주소가 등록되지 않았어요. 앱 운영자에게 문의해주세요.`,
      );
      return;
    }

    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error('unsupported URL');
      await Linking.openURL(url);
    } catch {
      Alert.alert(
        '페이지를 열 수 없어요',
        '주소를 확인하거나 잠시 후 다시 시도해주세요.',
      );
    }
  }

  function confirmDeleteAccount() {
    Alert.alert(
      '계정을 영구 삭제할까요?',
      '내가 만든 일정과 계정 정보가 삭제됩니다. 상대가 연결되어 있으면 캘린더는 상대에게 남고, 혼자 쓰는 캘린더는 함께 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '계속',
          style: 'destructive',
          onPress: () => {
            Alert.alert('마지막 확인', '이 작업은 되돌릴 수 없습니다.', [
              { text: '취소', style: 'cancel' },
              {
                text: '계정 삭제',
                style: 'destructive',
                onPress: async () => {
                  setDeleting(true);
                  try {
                    await deleteAccount();
                    router.replace('/(auth)/login');
                  } catch (error) {
                    setDeleting(false);
                    Alert.alert(
                      '계정 삭제 실패',
                      error instanceof Error
                        ? error.message
                        : '잠시 후 다시 시도해주세요.',
                    );
                  }
                },
              },
            ]);
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <ScreenHeader title="설정" />
      <ScrollView contentContainerStyle={styles.body}>
        {/* 내 정보 */}
        <Text style={styles.section}>내 정보</Text>
        <Text style={styles.label}>이름</Text>
        <View style={styles.inlineRow}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            value={name}
            onChangeText={setName}
            placeholder="이름"
            placeholderTextColor={theme.textMuted}
          />
          <TouchableOpacity style={styles.smallBtn} onPress={saveName}>
            <Text style={styles.smallBtnText}>저장</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>내 색상</Text>
        <View style={styles.colorRow}>
          {MEMBER_COLORS.map((c) => (
            <TouchableOpacity
              key={c}
              onPress={() => saveColor(c)}
              accessibilityRole="radio"
              accessibilityLabel={`색상 ${c}`}
              accessibilityState={{ selected: color === c }}
              style={[
                styles.swatch,
                { backgroundColor: c },
                color === c && styles.swatchSelected,
              ]}
            />
          ))}
        </View>

        {/* 상대 */}
        <Text style={styles.section}>상대</Text>
        {partner ? (
          <View style={styles.partnerRow}>
            <View style={[styles.dot, { backgroundColor: partner.color }]} />
            <Text style={styles.partnerName}>
              {partner.profile?.display_name ?? '친구'}
            </Text>
            <Text style={styles.partnerTag}>연결됨 ✓</Text>
          </View>
        ) : (
          <View>
            <Text style={styles.muted}>
              아직 상대가 참여하지 않았어요. 초대 코드를 공유하세요.
            </Text>
            {code ? (
              <View style={styles.codeBox}>
                <Text
                  style={styles.codeText}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                  selectable
                >
                  {code}
                </Text>
                <TouchableOpacity style={styles.shareBtn} onPress={shareInvite}>
                  <Text style={styles.shareBtnText}>공유하기</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.button, busy && styles.disabled]}
                onPress={makeInvite}
                disabled={busy}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>초대 코드 만들기</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* 알림 */}
        <Text style={styles.section}>알림</Text>
        <TouchableOpacity
          style={[styles.outlineBtn, notificationBusy && styles.disabled]}
          onPress={enableNotifications}
          disabled={notificationBusy}
        >
          {notificationBusy ? (
            <ActivityIndicator color={theme.primary} />
          ) : (
            <Text style={styles.outlineBtnText}>이 기기에서 알림 켜기</Text>
          )}
        </TouchableOpacity>

        {/* 도움말 및 법적 고지 */}
        <Text style={styles.section}>도움말 및 법적 고지</Text>
        <View style={styles.linkGroup}>
          <TouchableOpacity
            style={styles.linkRow}
            onPress={() =>
              void openInfoPage(privacyPolicyUrl, '개인정보처리방침')
            }
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>개인정보처리방침</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.linkRow, styles.linkRowLast]}
            onPress={() => void openInfoPage(supportUrl, '지원 페이지')}
            accessibilityRole="link"
          >
            <Text style={styles.linkText}>도움말 및 문의</Text>
            <Text style={styles.linkChevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* 계정 */}
        <Text style={styles.section}>계정</Text>
        <TouchableOpacity style={styles.signOut} onPress={confirmSignOut}>
          <Text style={styles.signOutText}>로그아웃</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.deleteAccount, deleting && styles.disabled]}
          onPress={confirmDeleteAccount}
          disabled={deleting}
        >
          {deleting ? (
            <ActivityIndicator color={theme.danger} />
          ) : (
            <Text style={styles.deleteAccountText}>계정 영구 삭제</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  body: { padding: 20, paddingBottom: 40 },
  section: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.textMuted,
    marginTop: 24,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  label: { fontSize: 14, fontWeight: '600', color: theme.text, marginBottom: 6 },
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
  inlineRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  smallBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  smallBtnText: { color: '#fff', fontWeight: '700' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  swatch: { width: 44, height: 44, borderRadius: 22 },
  swatchSelected: { borderWidth: 3, borderColor: theme.text },
  partnerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.border,
  },
  dot: { width: 16, height: 16, borderRadius: 8 },
  partnerName: { fontSize: 16, fontWeight: '700', color: theme.text, flex: 1 },
  partnerTag: { color: '#10B981', fontWeight: '700', fontSize: 13 },
  muted: { color: theme.textMuted, fontSize: 14, marginBottom: 12, lineHeight: 20 },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  codeBox: {
    backgroundColor: theme.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.border,
    padding: 20,
    alignItems: 'center',
    gap: 14,
  },
  codeText: {
    alignSelf: 'stretch',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 3,
    color: theme.text,
    textAlign: 'center',
  },
  shareBtn: {
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  shareBtnText: { color: '#fff', fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  outlineBtnText: { color: theme.text, fontWeight: '600' },
  linkGroup: {
    backgroundColor: theme.card,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  linkRow: {
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  linkRowLast: { borderBottomWidth: 0 },
  linkText: { flex: 1, color: theme.text, fontWeight: '600' },
  linkChevron: { color: theme.textMuted, fontSize: 26, lineHeight: 28 },
  signOut: {
    borderWidth: 1,
    borderColor: theme.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  signOutText: { color: theme.danger, fontWeight: '700' },
  deleteAccount: {
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  deleteAccountText: { color: theme.textMuted, fontWeight: '600', fontSize: 13 },
});
