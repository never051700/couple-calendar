// Supabase 연결 + 스키마 검증 스모크 테스트
// 사용: node scripts/smoke.mjs
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// .env 간단 파싱
const env = {};
if (fs.existsSync('.env')) {
  for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
}

const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? env.EXPO_PUBLIC_SUPABASE_URL;
const key =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Supabase 연결 값이 없습니다. .env.example을 참고해 .env를 설정하세요.');
  process.exit(2);
}
console.log('Supabase 연결 값을 불러왔습니다.');

const supabase = createClient(url, key);

async function main() {
  let ok = true;

  // 1) 테이블 존재 확인 (RLS로 결과는 비어도 정상, 테이블 없으면 에러)
  for (const table of [
    'profiles',
    'spaces',
    'space_members',
    'invites',
    'events',
    'push_tokens',
  ]) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (error) {
      if (['profiles', 'push_tokens'].includes(table) && error.code === '42501') {
        console.log(`✅ 테이블 '${table}' 존재, 익명 접근 차단됨`);
      } else {
        console.log(`❌ 테이블 '${table}': ${error.message} (code ${error.code})`);
        ok = false;
      }
    } else {
      console.log(`✅ 테이블 '${table}' 접근 가능`);
    }
  }

  const { error: colorRpcErr } = await supabase.rpc('update_my_member_color', {
    _space_id: '00000000-0000-0000-0000-000000000000',
    _color: '#3B82F6',
  });
  if (colorRpcErr?.code === 'PGRST202') {
    console.log('❌ RPC update_my_member_color 없음 → 0002 마이그레이션 필요');
    ok = false;
  } else {
    console.log('✅ 보안 강화 RPC update_my_member_color 존재');
  }

  const { error: pushRpcErr } = await supabase.rpc('register_push_token', {
    _token: 'ExpoPushToken[smoke-test-placeholder]',
    _platform: 'ios',
  });
  if (pushRpcErr?.code === 'PGRST202') {
    console.log('❌ RPC register_push_token 없음 → 최신 0002 마이그레이션 필요');
    ok = false;
  } else {
    console.log('✅ 보안 강화 RPC register_push_token 존재');
  }

  // 2) RPC 존재 확인 (잘못된 인자로 호출 → 함수가 있으면 특정 에러, 없으면 PGRST202)
  const { error: rpcErr } = await supabase.rpc('create_invite', {
    _space_id: '00000000-0000-0000-0000-000000000000',
  });
  if (rpcErr && rpcErr.code === 'PGRST202') {
    console.log('❌ RPC create_invite 없음 → 마이그레이션 미적용 가능성');
    ok = false;
  } else {
    console.log('✅ RPC create_invite 존재 (응답:', rpcErr ? rpcErr.message : 'OK', ')');
  }

  console.log(ok ? '\n🎉 스키마 검증 통과' : '\n⚠️  일부 항목 실패 — 마이그레이션 SQL 실행 여부 확인 필요');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error('연결 실패:', e.message);
  process.exit(1);
});
