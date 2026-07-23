-- =====================================================================
-- iOS 출시 준비 + 보안 강화
-- 기존 0001 적용 프로젝트에도 이 파일을 추가로 실행하세요.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 푸시 토큰을 파트너가 조회 가능한 profiles에서 분리 (다중 기기 지원)
-- ---------------------------------------------------------------------
-- Abort before changing anything when legacy membership data violates the
-- one-user/one-space and two-members-per-space invariants introduced below.
do $$
declare
  _multi_space_users bigint;
  _oversized_spaces bigint;
begin
  select count(*) into _multi_space_users
  from (
    select user_id
    from public.space_members
    group by user_id
    having count(*) > 1
  ) invalid_users;

  select count(*) into _oversized_spaces
  from (
    select space_id
    from public.space_members
    group by space_id
    having count(*) > 2
  ) invalid_spaces;

  if _multi_space_users > 0 or _oversized_spaces > 0 then
    raise exception
      '0002 migration aborted: % users belong to multiple calendars and % calendars have more than two members. Clean space_members and run 0002 again.',
      _multi_space_users,
      _oversized_spaces;
  end if;
end $$;

create table if not exists public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_tokens_platform_check check (platform in ('ios', 'android'))
);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
  before update on public.push_tokens
  for each row execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens for select
using (user_id = auth.uid());

drop policy if exists push_tokens_insert_own on public.push_tokens;
create policy push_tokens_insert_own on public.push_tokens for insert
with check (user_id = auth.uid());

drop policy if exists push_tokens_update_own on public.push_tokens;
create policy push_tokens_update_own on public.push_tokens for update
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_tokens_delete_own on public.push_tokens;
create policy push_tokens_delete_own on public.push_tokens for delete
using (user_id = auth.uid());

-- Clients mutate this table only through the validated security-definer RPCs
-- below. Keeping direct writes closed also prevents token-row spam.
revoke all on public.push_tokens from anon, authenticated;

-- Legacy profile tokens are deliberately discarded. The old app could attach
-- one physical-device token to several accounts, so migration cannot infer a
-- safe owner. Each signed-in device re-registers through register_push_token.
update public.profiles
set expo_push_token = null,
    platform = null
where expo_push_token is not null or platform is not null;

create or replace function public.register_push_token(
  _token text,
  _platform text
)
returns void language plpgsql security definer set search_path = public as $$
declare _normalized_token text := trim(_token);
begin
  if auth.uid() is null then
    raise exception 'Login is required.';
  end if;
  if _platform not in ('ios', 'android') then
    raise exception 'Invalid push-token platform.';
  end if;
  if length(_normalized_token) not between 20 and 512
     or not (
       _normalized_token like 'ExpoPushToken[%]'
       or _normalized_token like 'ExponentPushToken[%]'
     ) then
    raise exception 'Invalid Expo push token.';
  end if;

  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);
  insert into public.push_tokens (token, user_id, platform)
  values (_normalized_token, auth.uid(), _platform)
  on conflict (token) do update
  set user_id = auth.uid(),
      platform = excluded.platform,
      updated_at = now();

  -- Keep multi-device support bounded if a buggy or hostile client rotates
  -- syntactically valid tokens without unregistering old ones.
  delete from public.push_tokens
  where token in (
    select token
    from public.push_tokens
    where user_id = auth.uid()
    order by updated_at desc
    offset 10
  );
end;
$$;

-- Possession of an unguessable Expo token is used to clean a stale
-- association after an offline logout or account switch. A caller could
-- already claim the same token through register_push_token.
create or replace function public.unregister_push_token(_token text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Login is required.';
  end if;
  if length(trim(_token)) not between 20 and 512 then
    raise exception 'Invalid Expo push token.';
  end if;

  delete from public.push_tokens where token = trim(_token);
end;
$$;

revoke all on function public.register_push_token(text, text) from public;
revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.register_push_token(text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;

-- RLS는 행 단위이므로 민감 컬럼은 열 권한으로도 차단합니다.
revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_url, timezone, created_at, updated_at)
  on public.profiles to authenticated;
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, timezone)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------
-- 멤버십/이벤트 RLS 우회 차단
-- ---------------------------------------------------------------------
create or replace function public.is_space_member(_space_id uuid, _user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select _user_id = auth.uid()
    and exists (
      select 1 from public.space_members m
      where m.space_id = _space_id and m.user_id = _user_id
    );
$$;

drop policy if exists space_members_update on public.space_members;
revoke update on public.space_members from authenticated;

create or replace function public.update_my_member_color(
  _space_id uuid,
  _color text
)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  if _color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception '올바르지 않은 색상입니다.';
  end if;

  update public.space_members
  set color = upper(_color)
  where space_id = _space_id and user_id = auth.uid();

  if not found then
    raise exception '이 공간의 멤버가 아닙니다.';
  end if;
end;
$$;

revoke all on function public.update_my_member_color(uuid, text) from public;
grant execute on function public.update_my_member_color(uuid, text) to authenticated;

drop policy if exists events_update on public.events;
create policy events_update on public.events for update
using (owner_id = auth.uid())
with check (
  owner_id = auth.uid()
  and public.is_space_member(space_id, auth.uid())
);

-- ---------------------------------------------------------------------
-- 둘이 쓰는 MVP 규칙과 일회용 초대 코드
-- ---------------------------------------------------------------------
update public.invites
set expires_at = now()
where accepted_at is null and length(code) < 12 and expires_at > now();

create or replace function public.enforce_space_member_limit()
returns trigger language plpgsql set search_path = public as $$
begin
  perform pg_advisory_xact_lock(hashtext(new.space_id::text)::bigint);

  if exists (
    select 1 from public.space_members
    where user_id = new.user_id and space_id <> new.space_id
  ) then
    raise exception '이미 다른 캘린더에 참여하고 있습니다.';
  end if;

  if (
    select count(*) from public.space_members where space_id = new.space_id
  ) >= 2 then
    raise exception '이 캘린더에는 이미 두 명이 참여하고 있습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists space_members_limit_two on public.space_members;
create trigger space_members_limit_two
  before insert on public.space_members
  for each row execute function public.enforce_space_member_limit();

create or replace function public.create_space(_name text, _color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _space_id uuid;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);
  if exists (select 1 from public.space_members where user_id = auth.uid()) then
    raise exception '이미 참여 중인 캘린더가 있습니다.';
  end if;
  if _color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception '올바르지 않은 색상입니다.';
  end if;

  insert into public.spaces (name, created_by, type)
  values (
    left(coalesce(nullif(trim(_name), ''), '우리 캘린더'), 80),
    auth.uid(),
    'shared'
  )
  returning id into _space_id;

  insert into public.space_members (space_id, user_id, color, role)
  values (_space_id, auth.uid(), upper(_color), 'owner');
  return _space_id;
end;
$$;

create or replace function public.create_invite(_space_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare
  _code text;
  _attempt int := 0;
begin
  if not public.is_space_member(_space_id, auth.uid()) then
    raise exception '이 공간의 멤버가 아닙니다.';
  end if;
  if (select count(*) from public.space_members where space_id = _space_id) >= 2 then
    raise exception '이미 두 명이 연결되어 있습니다.';
  end if;

  update public.invites
  set expires_at = now()
  where space_id = _space_id
    and accepted_at is null
    and expires_at > now();

  loop
    _attempt := _attempt + 1;
    _code := upper(encode(gen_random_bytes(6), 'hex'));
    begin
      insert into public.invites (space_id, code, created_by)
      values (_space_id, _code, auth.uid());
      return _code;
    exception when unique_violation then
      if _attempt >= 5 then raise; end if;
    end;
  end loop;
end;
$$;

create or replace function public.accept_invite(_code text, _color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _inv public.invites;
begin
  if auth.uid() is null then
    raise exception '로그인이 필요합니다.';
  end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text)::bigint);
  if _color !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception '올바르지 않은 색상입니다.';
  end if;

  select * into _inv
  from public.invites
  where code = upper(trim(_code))
  for update;

  if _inv.id is null then
    raise exception '유효하지 않은 초대 코드입니다.';
  end if;
  if _inv.accepted_at is not null then
    if _inv.accepted_by = auth.uid() then return _inv.space_id; end if;
    raise exception '이미 사용된 초대 코드입니다.';
  end if;
  if _inv.expires_at < now() then
    raise exception '만료된 초대 코드입니다.';
  end if;

  perform pg_advisory_xact_lock(hashtext(_inv.space_id::text)::bigint);

  if public.is_space_member(_inv.space_id, auth.uid()) then
    update public.invites
    set accepted_by = auth.uid(), accepted_at = now()
    where id = _inv.id;
    return _inv.space_id;
  end if;
  if exists (select 1 from public.space_members where user_id = auth.uid()) then
    raise exception '이미 다른 캘린더에 참여하고 있습니다.';
  end if;
  if (select count(*) from public.space_members where space_id = _inv.space_id) >= 2 then
    raise exception '이 캘린더에는 이미 두 명이 참여하고 있습니다.';
  end if;

  insert into public.space_members (space_id, user_id, color, role)
  values (_inv.space_id, auth.uid(), upper(_color), 'member');

  update public.invites
  set accepted_by = auth.uid(), accepted_at = now()
  where id = _inv.id;

  return _inv.space_id;
end;
$$;

revoke all on function public.create_space(text, text) from public;
revoke all on function public.create_invite(uuid) from public;
revoke all on function public.accept_invite(text, text) from public;
revoke all on function public.is_space_member(uuid, uuid) from public;
grant execute on function public.create_space(text, text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.is_space_member(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 신규/수정 데이터 무결성 (기존 데이터는 운영자가 정리 후 VALIDATE 가능)
-- ---------------------------------------------------------------------
do $$ begin
  alter table public.spaces add constraint spaces_type_check
    check (type in ('shared', 'couple', 'family')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.space_members add constraint space_members_role_check
    check (role in ('owner', 'member')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.space_members add constraint space_members_color_check
    check (color ~ '^#[0-9A-Fa-f]{6}$') not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_visibility_check
    check (visibility in ('shared', 'private')) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_time_order_check
    check (ends_at >= starts_at) not valid;
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.events add constraint events_reminder_check
    check (reminder_minutes is null or reminder_minutes >= 0) not valid;
exception when duplicate_object then null; end $$;
