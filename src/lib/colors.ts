// 멤버에게 배정할 수 있는 색상 팔레트
export const MEMBER_COLORS = [
  '#3B82F6', // 파랑
  '#F97316', // 주황
  '#10B981', // 초록
  '#EC4899', // 분홍
  '#8B5CF6', // 보라
  '#EF4444', // 빨강
  '#14B8A6', // 청록
  '#F59E0B', // 호박
] as const;

export const DEFAULT_MY_COLOR = MEMBER_COLORS[0];
export const DEFAULT_PARTNER_COLOR = MEMBER_COLORS[1];

// 이미 사용 중인 색을 피해서 다음 색 추천
export function suggestColor(taken: string[]): string {
  const found = MEMBER_COLORS.find((c) => !taken.includes(c));
  return found ?? MEMBER_COLORS[0];
}

// UI 테마 (라이트/다크 공통 기본값)
export const theme = {
  primary: '#3B82F6',
  bg: '#FFFFFF',
  card: '#F8FAFC',
  border: '#E2E8F0',
  text: '#0F172A',
  textMuted: '#64748B',
  danger: '#EF4444',
};
