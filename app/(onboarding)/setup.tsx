import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { registerPushToken } from '@/lib/notifications';
import {
  MEMBER_COLORS,
  DEFAULT_MY_COLOR,
  DEFAULT_PARTNER_COLOR,
  theme,
} from '@/lib/colors';

type Mode = 'choose' | 'create' | 'join';

export default function Setup() {
  const { userId } = useAuth();
  const [mode, setMode] = useState<Mode>('choose');
  const [name, setName] = useState('우리 캘린더');
  const [code, setCode] = useState('');
  const [color, setColor] = useState<string>(DEFAULT_MY_COLOR);
  const [busy, setBusy] = useState(false);

  async function finishInto(spaceId: string | null) {
    if (!spaceId) {
      Alert.alert('오류', '공간을 여는 데 실패했습니다.');
      return;
    }
    if (userId) await registerPushToken(userId);
    router.replace('/(app)/calendar');
  }

  async function createSpace() {
    setBusy(true);
    const { data, error } = await supabase.rpc('create_space', {
      _name: name,
      _color: color,
    });
    setBusy(false);
    if (error) {
      Alert.alert('오류', error.message);
      return;
    }
    await finishInto(data as string);
  }

  async function joinSpace() {
    if (code.trim().length < 12) {
      Alert.alert('알림', '초대 코드를 확인해주세요.');
      return;
    }
    setBusy(true);
    const { data, error } = await supabase.rpc('accept_invite', {
      _code: code.trim(),
      _color: color,
    });
    setBusy(false);
    if (error) {
      Alert.alert('오류', error.message);
      return;
    }
    await finishInto(data as string);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView
        contentContainerStyle={styles.container}
        automaticallyAdjustKeyboardInsets
        keyboardShouldPersistTaps="handled"
      >
        {mode === 'choose' && (
          <View style={styles.block}>
            <Text style={styles.title}>시작하기</Text>
            <Text style={styles.subtitle}>
              둘 중 한 명이 캘린더를 만들고 상대를 초대하세요.
            </Text>

            <TouchableOpacity
              style={styles.bigButton}
              onPress={() => {
                setColor(DEFAULT_MY_COLOR);
                setMode('create');
              }}
            >
              <Text style={styles.bigButtonEmoji}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bigButtonTitle}>새 캘린더 만들기</Text>
                <Text style={styles.bigButtonDesc}>
                  내가 먼저 만들고 초대 코드를 공유해요
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.bigButton}
              onPress={() => {
                setColor(DEFAULT_PARTNER_COLOR);
                setMode('join');
              }}
            >
              <Text style={styles.bigButtonEmoji}>🔗</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.bigButtonTitle}>초대 코드로 참여</Text>
                <Text style={styles.bigButtonDesc}>
                  상대에게 받은 코드를 입력해요
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'create' && (
          <View style={styles.block}>
            <Text style={styles.title}>새 캘린더</Text>

            <Text style={styles.label}>캘린더 이름</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="우리 캘린더"
              placeholderTextColor={theme.textMuted}
            />

            <ColorPicker value={color} onChange={setColor} />

            <TouchableOpacity
              style={[styles.button, busy && styles.disabled]}
              onPress={createSpace}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>만들기</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('choose')} disabled={busy}>
              <Text style={styles.link}>뒤로</Text>
            </TouchableOpacity>
          </View>
        )}

        {mode === 'join' && (
          <View style={styles.block}>
            <Text style={styles.title}>초대 코드 입력</Text>

            <Text style={styles.label}>초대 코드</Text>
            <TextInput
              style={[styles.input, styles.codeInput]}
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase())}
              placeholder="A1B2C3D4E5F6"
              placeholderTextColor={theme.textMuted}
              autoCapitalize="characters"
              maxLength={12}
            />

            <ColorPicker value={color} onChange={setColor} />

            <TouchableOpacity
              style={[styles.button, busy && styles.disabled]}
              onPress={joinSpace}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>참여하기</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setMode('choose')} disabled={busy}>
              <Text style={styles.link}>뒤로</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <View style={{ marginTop: 8 }}>
      <Text style={styles.label}>내 색상</Text>
      <View style={styles.colorRow}>
        {MEMBER_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => onChange(c)}
            accessibilityRole="radio"
            accessibilityLabel={`색상 ${c}`}
            accessibilityState={{ selected: value === c }}
            style={[
              styles.swatch,
              { backgroundColor: c },
              value === c && styles.swatchSelected,
            ]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  container: { padding: 24, flexGrow: 1, justifyContent: 'center' },
  block: { gap: 14 },
  title: { fontSize: 26, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 15, color: theme.textMuted, marginBottom: 8 },
  label: { fontSize: 14, fontWeight: '600', color: theme.text },
  input: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.text,
    backgroundColor: theme.card,
  },
  codeInput: { textAlign: 'center', letterSpacing: 3, fontSize: 19 },
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  disabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  link: { color: theme.primary, textAlign: 'center', marginTop: 4, fontSize: 14 },
  bigButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: 1,
    borderColor: theme.border,
    backgroundColor: theme.card,
    borderRadius: 16,
    padding: 18,
  },
  bigButtonEmoji: { fontSize: 30 },
  bigButtonTitle: { fontSize: 17, fontWeight: '700', color: theme.text },
  bigButtonDesc: { fontSize: 13, color: theme.textMuted, marginTop: 2 },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
  swatch: { width: 44, height: 44, borderRadius: 22 },
  swatchSelected: { borderWidth: 3, borderColor: theme.text },
});
