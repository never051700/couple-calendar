import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.110.7';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response('method not allowed', {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const authorization = req.headers.get('Authorization');
    const jwt = authorization?.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response('unauthorized', { status: 401, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceRoleKey) throw new Error('server is not configured');

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const {
      data: { user },
      error: userError,
    } = await admin.auth.getUser(jwt);
    if (userError || !user) {
      return new Response('unauthorized', { status: 401, headers: corsHeaders });
    }

    const { data: deletionReady, error: readinessError } = await admin.rpc(
      'account_deletion_ready',
    );
    if (readinessError || deletionReady !== true) {
      console.error('account deletion migration is not ready', readinessError);
      return new Response('account deletion is not configured', {
        status: 503,
        headers: corsHeaders,
      });
    }

    // 0003 migration의 BEFORE DELETE trigger가 소유권 이전과 사용자 삭제를
    // 하나의 DB 트랜잭션으로 묶습니다. 실패하면 양쪽 변경이 모두 롤백됩니다.
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
    if (deleteError) throw deleteError;

    return new Response(JSON.stringify({ deleted: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error(error);
    return new Response('account deletion failed', {
      status: 500,
      headers: corsHeaders,
    });
  }
});
