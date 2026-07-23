// DB 테이블과 1:1로 대응하는 앱 타입

export type Visibility = 'shared' | 'private';

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  timezone: string;
  created_at: string;
  updated_at: string;
}

export interface Space {
  id: string;
  name: string;
  type: 'shared' | 'couple' | 'family';
  created_by: string;
  created_at: string;
}

export interface SpaceMember {
  space_id: string;
  user_id: string;
  color: string;
  role: 'owner' | 'member';
  joined_at: string;
  // 조인해서 채우는 필드
  profile?: Profile;
}

export interface CalendarEvent {
  id: string;
  space_id: string;
  owner_id: string;
  title: string;
  description: string | null;
  location: string | null;
  starts_at: string; // ISO (UTC)
  ends_at: string; // ISO (UTC)
  all_day: boolean;
  timezone: string;
  color: string | null;
  visibility: Visibility;
  reminder_minutes: number | null;
  recurrence_rule: string | null;
  created_at: string;
  updated_at: string;
}
