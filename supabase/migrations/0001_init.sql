-- =====================================================================
-- 우리 캘린더 — 초기 스키마
-- Supabase 대시보드 > SQL Editor 에 붙여넣고 실행하세요.
-- =====================================================================

-- ---------- 확장 ----------
create extension if not exists "pgcrypto";

-- =====================================================================
-- 테이블
-- =====================================================================

-- 사용자 프로필 (auth.users 와 1:1)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  timezone text not null default 'Asia/Seoul',
  expo_push_token text,
  platform text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 공유 공간 (지금은 1개, 나중에 커플/가족으로 확장)
create table if not exists public.spaces (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리 캘린더',
  type text not null default 'shared',   -- shared | couple | family
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- 공간 멤버 (사람별 색상 배정)
-- user_id 는 profiles(id) 를 참조 → PostgREST 가 프로필 조인(embed)을 인식.
-- profiles.id 자체가 auth.users(id) 를 cascade 참조하므로 무결성도 유지됨.
create table if not exists public.space_members (
  space_id uuid not null references public.spaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  color text not null default '#3B82F6',
  role text not null default 'member',    -- owner | member
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

-- 초대 (페어링용 코드)
create table if not exists public.invites (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

-- 일정
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  space_id uuid not null references public.spaces(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  location text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  timezone text not null default 'Asia/Seoul',
  color text,                              -- null 이면 소유자 색상 상속
  visibility text not null default 'shared', -- shared | private
  reminder_minutes int,                    -- 예: 30 = 30분 전 알림
  recurrence_rule text,                    -- Phase 2 (RRULE) — 지금은 미사용
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists events_space_time_idx
  on public.events (space_id, starts_at);

-- =====================================================================
-- 트리거: updated_at 자동 갱신
-- =====================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- =====================================================================
-- 트리거: 회원가입 시 프로필 자동 생성
-- =====================================================================
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(split_part(new.email, '@', 1), '사용자'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
-- 헬퍼: 멤버십 확인 (RLS 재귀 방지용 security definer)
-- =====================================================================
create or replace function public.is_space_member(_space_id uuid, _user_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = _space_id and m.user_id = _user_id
  );
$$;

-- =====================================================================
-- RPC: 공간 생성 / 초대 발급 / 초대 수락
-- =====================================================================

-- 공간을 만들고 생성자를 owner 멤버로 추가
create or replace function public.create_space(_name text, _color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _space_id uuid;
begin
  insert into public.spaces (name, created_by, type)
  values (coalesce(nullif(_name, ''), '우리 캘린더'), auth.uid(), 'shared')
  returning id into _space_id;

  insert into public.space_members (space_id, user_id, color, role)
  values (_space_id, auth.uid(), coalesce(_color, '#3B82F6'), 'owner');

  return _space_id;
end;
$$;

-- 6자리 초대 코드 발급 (멤버만 가능)
create or replace function public.create_invite(_space_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare _code text;
begin
  if not public.is_space_member(_space_id, auth.uid()) then
    raise exception '이 공간의 멤버가 아닙니다.';
  end if;

  _code := upper(substring(md5(random()::text) from 1 for 6));

  insert into public.invites (space_id, code, created_by)
  values (_space_id, _code, auth.uid());

  return _code;
end;
$$;

-- 초대 코드로 공간 참여
create or replace function public.accept_invite(_code text, _color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare _inv public.invites;
begin
  select * into _inv from public.invites where code = upper(trim(_code));

  if _inv.id is null then
    raise exception '유효하지 않은 초대 코드입니다.';
  end if;
  if _inv.expires_at < now() then
    raise exception '만료된 초대 코드입니다.';
  end if;

  -- 이미 멤버면 그대로 반환
  if public.is_space_member(_inv.space_id, auth.uid()) then
    return _inv.space_id;
  end if;

  insert into public.space_members (space_id, user_id, color, role)
  values (_inv.space_id, auth.uid(), coalesce(_color, '#F97316'), 'member');

  update public.invites
  set accepted_by = auth.uid(), accepted_at = now()
  where id = _inv.id;

  return _inv.space_id;
end;
$$;

grant execute on function public.create_space(text, text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.accept_invite(text, text) to authenticated;
grant execute on function public.is_space_member(uuid, uuid) to authenticated;

-- =====================================================================
-- RLS (행 수준 보안)
-- =====================================================================
alter table public.profiles       enable row level security;
alter table public.spaces         enable row level security;
alter table public.space_members  enable row level security;
alter table public.invites        enable row level security;
alter table public.events         enable row level security;

-- ---------- profiles ----------
-- 본인 + 같은 공간을 공유하는 상대의 프로필을 볼 수 있음
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select
using (
  id = auth.uid()
  or exists (
    select 1
    from public.space_members m1
    join public.space_members m2 on m1.space_id = m2.space_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id
  )
);

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update
using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert
with check (id = auth.uid());

-- ---------- spaces ----------
drop policy if exists spaces_select on public.spaces;
create policy spaces_select on public.spaces for select
using (public.is_space_member(id, auth.uid()));

drop policy if exists spaces_update on public.spaces;
create policy spaces_update on public.spaces for update
using (created_by = auth.uid()) with check (created_by = auth.uid());

-- ---------- space_members ----------
drop policy if exists space_members_select on public.space_members;
create policy space_members_select on public.space_members for select
using (public.is_space_member(space_id, auth.uid()));

drop policy if exists space_members_update on public.space_members;
create policy space_members_update on public.space_members for update
using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- invites ----------
-- 코드 수락은 RPC(security definer)로 처리하므로 select 는 멤버에게만
drop policy if exists invites_select on public.invites;
create policy invites_select on public.invites for select
using (public.is_space_member(space_id, auth.uid()));

-- ---------- events ----------
-- 조회: 같은 공간 멤버 + (공유 일정 또는 내 일정)
drop policy if exists events_select on public.events;
create policy events_select on public.events for select
using (
  public.is_space_member(space_id, auth.uid())
  and (visibility = 'shared' or owner_id = auth.uid())
);

-- 생성: 내가 소유자이고 그 공간의 멤버일 때
drop policy if exists events_insert on public.events;
create policy events_insert on public.events for insert
with check (
  owner_id = auth.uid()
  and public.is_space_member(space_id, auth.uid())
);

-- 수정/삭제: 소유자만
drop policy if exists events_update on public.events;
create policy events_update on public.events for update
using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists events_delete on public.events;
create policy events_delete on public.events for delete
using (owner_id = auth.uid());

-- =====================================================================
-- Realtime: events / space_members 변경 실시간 구독 활성화
-- =====================================================================
do $$
begin
  begin
    alter publication supabase_realtime add table public.events;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.space_members;
  exception when duplicate_object then null;
  end;
end $$;
