// =====================================================================
// Edge Function: notify-event
// events 테이블 INSERT/UPDATE 시 상대에게 Expo 푸시 알림 발송
//
// 설치:
//   1) supabase functions deploy notify-event --no-verify-jwt
//   2) Supabase 대시보드 > Database > Webhooks 에서
//      events 테이블의 INSERT, UPDATE 이벤트를
//      이 함수 URL 로 보내도록 웹훅 생성
// =====================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

interface EventRecord {
  id: string;
  space_id: string;
  owner_id: string;
  title: string;
  visibility: string;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: EventRecord | null;
  old_record: EventRecord | null;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

function secretsMatch(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

Deno.serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response('method not allowed', { status: 405 });
    }

    const webhookSecret = Deno.env.get('WEBHOOK_SECRET');
    if (!webhookSecret) throw new Error('WEBHOOK_SECRET is not configured');
    if (!secretsMatch(req.headers.get('x-webhook-secret'), webhookSecret)) {
      return new Response('unauthorized', { status: 401 });
    }

    const payload = (await req.json()) as WebhookPayload;
    if (!['INSERT', 'UPDATE'].includes(payload.type)) {
      return new Response('event ignored', { status: 200 });
    }
    const recordId = payload.record?.id;
    if (!recordId) return new Response('no record', { status: 200 });

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('server is not configured');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 웹훅 본문을 신뢰하지 않고 DB의 현재 레코드를 다시 조회합니다.
    const { data: rec, error: eventError } = await supabase
      .from('events')
      .select('id, space_id, owner_id, title, visibility')
      .eq('id', recordId)
      .maybeSingle();
    if (eventError) throw eventError;
    if (!rec || rec.visibility === 'private') {
      return new Response('private or deleted, skip', { status: 200 });
    }

    // 같은 공간의 다른 멤버들
    const { data: members, error: membersError } = await supabase
      .from('space_members')
      .select('user_id')
      .eq('space_id', rec.space_id)
      .neq('user_id', rec.owner_id);
    if (membersError) throw membersError;

    const otherIds = (members ?? []).map((m) => m.user_id);
    if (otherIds.length === 0) {
      return new Response('no partner', { status: 200 });
    }

    // 작성자 이름 + 상대 푸시 토큰
    const [ownerResult, tokenResult] = await Promise.all([
      supabase
        .from('profiles')
        .select('display_name')
        .eq('id', rec.owner_id)
        .maybeSingle(),
      supabase.from('push_tokens').select('token').in('user_id', otherIds),
    ]);
    if (ownerResult.error) throw ownerResult.error;
    if (tokenResult.error) throw tokenResult.error;

    const ownerName = ownerResult.data?.display_name ?? '상대';
    const verb = payload.type === 'INSERT' ? '추가했어요' : '변경했어요';

    const messages = (tokenResult.data ?? [])
      .filter((row) => !!row.token)
      .map((p) => ({
        to: p.token,
        sound: 'default',
        title: '📅 일정 업데이트',
        body: `${ownerName}님이 '${rec.title}' 일정을 ${verb}`,
        data: { eventId: rec.id },
      }));

    if (messages.length > 0) {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      if (!response.ok) {
        throw new Error(`Expo push returned ${response.status}`);
      }
    }

    return new Response(JSON.stringify({ sent: messages.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error(e);
    return new Response(`error: ${e}`, { status: 500 });
  }
});
