import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import { supabase } from './supabase';
import { useAuth } from './auth';
import { Space, SpaceMember } from '../types/db';

interface SpaceContextValue {
  loading: boolean;
  error: string | null;
  space: Space | null;
  members: SpaceMember[];
  me: SpaceMember | null;
  partner: SpaceMember | null;
  refresh: () => Promise<void>;
}

const SpaceContext = createContext<SpaceContextValue>({
  loading: true,
  error: null,
  space: null,
  members: [],
  me: null,
  partner: null,
  refresh: async () => {},
});

export function SpaceProvider({ children }: { children: React.ReactNode }) {
  const { userId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [space, setSpace] = useState<Space | null>(null);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) {
      setSpace(null);
      setMembers([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // 내가 속한 첫 번째 공간을 사용 (MVP: 1인 1공간)
    const { data: myMemberships, error: membershipError } = await supabase
      .from('space_members')
      .select('space_id')
      .eq('user_id', userId)
      .limit(1);

    if (membershipError) {
      setError('캘린더 정보를 불러오지 못했습니다.');
      setLoading(false);
      return;
    }

    const spaceId = myMemberships?.[0]?.space_id;
    if (!spaceId) {
      setSpace(null);
      setMembers([]);
      setLoading(false);
      return;
    }

    const [spaceResult, memberResult] = await Promise.all([
      supabase.from('spaces').select('*').eq('id', spaceId).single(),
      supabase
        .from('space_members')
        .select(
          '*, profile:profiles(id, display_name, avatar_url, timezone, created_at, updated_at)',
        )
        .eq('space_id', spaceId),
    ]);

    if (spaceResult.error || memberResult.error) {
      setError('캘린더 정보를 불러오지 못했습니다.');
      setLoading(false);
      return;
    }

    setSpace((spaceResult.data as Space) ?? null);
    setMembers((memberResult.data as SpaceMember[]) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // 멤버 변동(상대가 참여/색상변경) 실시간 반영
  useEffect(() => {
    if (!space) return;
    const channel = supabase
      .channel(`space-members-${space.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'space_members',
          filter: `space_id=eq.${space.id}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [space, refresh]);

  const me = members.find((m) => m.user_id === userId) ?? null;
  const partner = members.find((m) => m.user_id !== userId) ?? null;

  return (
    <SpaceContext.Provider
      value={{ loading, error, space, members, me, partner, refresh }}
    >
      {children}
    </SpaceContext.Provider>
  );
}

export function useSpace() {
  return useContext(SpaceContext);
}

// 멤버별 색상 조회 헬퍼
export function colorForOwner(
  members: SpaceMember[],
  ownerId: string,
  fallback = '#3B82F6',
): string {
  return members.find((m) => m.user_id === ownerId)?.color ?? fallback;
}

export function nameForOwner(
  members: SpaceMember[],
  ownerId: string,
): string {
  const m = members.find((mm) => mm.user_id === ownerId);
  return m?.profile?.display_name ?? '멤버';
}
