import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { theme } from '@/lib/colors';

export default function ScreenHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/(app)/calendar'))}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="뒤로"
      >
        <Text style={styles.back}>‹ 뒤로</Text>
      </TouchableOpacity>
      <Text style={styles.title} numberOfLines={1}>
        {title}
      </Text>
      <View style={styles.right}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  back: {
    color: theme.primary,
    fontSize: 16,
    fontWeight: '600',
    width: 70,
    minHeight: 44,
    textAlignVertical: 'center',
  },
  title: { fontSize: 17, fontWeight: '700', color: theme.text, flex: 1, textAlign: 'center' },
  right: { width: 70, alignItems: 'flex-end' },
});
