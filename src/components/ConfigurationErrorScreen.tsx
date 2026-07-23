import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { theme } from '@/lib/colors';

export default function ConfigurationErrorScreen() {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.card}>
        <Text style={styles.icon} accessibilityElementsHidden>🛠️</Text>
        <Text style={styles.title}>앱 연결 설정이 필요해요</Text>
        <Text style={styles.body}>
          Supabase 주소와 공개 키가 아직 연결되지 않았습니다. 프로젝트의
          .env.example을 .env로 복사한 뒤 두 값을 입력하고 앱을 다시 시작해
          주세요.
        </Text>
        <Text style={styles.note}>
          iPhone과 Android 배포 빌드에서는 같은 값을 EAS 환경 변수에도 등록해야
          합니다.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: theme.bg,
  },
  card: {
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 20,
    padding: 24,
    backgroundColor: theme.card,
  },
  icon: { fontSize: 36, marginBottom: 14 },
  title: { fontSize: 22, fontWeight: '800', color: theme.text },
  body: { marginTop: 12, fontSize: 15, lineHeight: 23, color: theme.text },
  note: { marginTop: 12, fontSize: 13, lineHeight: 20, color: theme.textMuted },
});
