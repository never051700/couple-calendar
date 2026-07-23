import { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  Linking,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { theme } from '@/lib/colors';
import { privacyPolicyUrl } from '@/lib/config';

type AuthMode = 'signIn' | 'signUp';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signIn');

  async function start() {
    const mail = email.trim().toLowerCase();
    if (!mail.includes('@')) {
      Alert.alert('알림', '올바른 이메일을 입력해주세요.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('알림', '비밀번호는 6자 이상으로 입력해주세요.');
      return;
    }

    setBusy(true);

    if (mode === 'signIn') {
      const { error } = await supabase.auth.signInWithPassword({
        email: mail,
        password,
      });
      setBusy(false);
      if (error) {
        Alert.alert('로그인 실패', '이메일과 비밀번호를 다시 확인해주세요.');
        return;
      }
      router.replace('/');
      return;
    }

    const signUp = await supabase.auth.signUp({ email: mail, password });
    setBusy(false);

    if (signUp.error) {
      Alert.alert('가입 실패', signUp.error.message);
      return;
    }
    if (!signUp.error && signUp.data.session) {
      router.replace('/');
      return;
    }

    Alert.alert(
      '확인 메일을 보냈어요',
      '메일에서 가입을 확인한 뒤 로그인해주세요.',
      [{ text: '확인', onPress: () => setMode('signIn') }],
    );
  }

  async function openPrivacyPolicy() {
    if (!privacyPolicyUrl) {
      Alert.alert(
        '개인정보처리방침 준비 중',
        '아직 공개 주소가 등록되지 않았어요. 앱 운영자에게 문의해주세요.',
      );
      return;
    }
    try {
      await Linking.openURL(privacyPolicyUrl);
    } catch {
      Alert.alert('페이지를 열 수 없어요', '잠시 후 다시 시도해주세요.');
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
        >
        <View style={styles.header}>
          <Text style={styles.logo}>📅</Text>
          <Text style={styles.title}>우리 캘린더</Text>
          <Text style={styles.subtitle}>둘이 함께 일정을 공유해요</Text>
        </View>

        <View style={styles.form}>
          <View style={styles.modeToggle}>
            {(['signIn', 'signUp'] as AuthMode[]).map((item) => (
              <TouchableOpacity
                key={item}
                style={[styles.modeButton, mode === item && styles.modeButtonActive]}
                onPress={() => setMode(item)}
                disabled={busy}
                accessibilityRole="button"
                accessibilityState={{ selected: mode === item }}
              >
                <Text
                  style={[
                    styles.modeButtonText,
                    mode === item && styles.modeButtonTextActive,
                  ]}
                >
                  {item === 'signIn' ? '로그인' : '계정 만들기'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <Text style={styles.label}>이메일</Text>
          <TextInput
            style={styles.input}
            placeholder="you@example.com"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            keyboardType="email-address"
            autoComplete="email"
            value={email}
            onChangeText={setEmail}
            editable={!busy}
          />

          <Text style={styles.label}>비밀번호</Text>
          <TextInput
            style={styles.input}
            placeholder="6자 이상"
            placeholderTextColor={theme.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
            value={password}
            onChangeText={setPassword}
            editable={!busy}
          />

          <TouchableOpacity
            style={[styles.button, busy && styles.buttonDisabled]}
            onPress={start}
            disabled={busy}
          >
            {busy ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                {mode === 'signIn' ? '로그인' : '계정 만들기'}
              </Text>
            )}
          </TouchableOpacity>

          <Text style={styles.hint}>
            {mode === 'signIn'
              ? '기존 계정으로 캘린더를 이어서 사용해요.'
              : '가입 확인 메일이 전송될 수 있어요.'}
          </Text>
          <TouchableOpacity
            onPress={() => void openPrivacyPolicy()}
            accessibilityRole="link"
            style={styles.privacyLink}
          >
            <Text style={styles.privacyLinkText}>개인정보처리방침</Text>
          </TouchableOpacity>
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: theme.bg },
  keyboardView: { flex: 1 },
  container: { flexGrow: 1, padding: 24, justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: '700', color: theme.text },
  subtitle: { fontSize: 15, color: theme.textMuted, marginTop: 6 },
  form: { gap: 12 },
  modeToggle: {
    flexDirection: 'row',
    padding: 3,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 12,
    backgroundColor: theme.card,
  },
  modeButton: { flex: 1, minHeight: 42, alignItems: 'center', justifyContent: 'center' },
  modeButtonActive: { borderRadius: 9, backgroundColor: theme.primary },
  modeButtonText: { color: theme.text, fontWeight: '700', fontSize: 14 },
  modeButtonTextActive: { color: '#fff' },
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
  button: {
    backgroundColor: theme.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { fontSize: 13, color: theme.textMuted, textAlign: 'center', marginTop: 8 },
  privacyLink: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  privacyLinkText: {
    color: theme.primary,
    fontSize: 13,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});
