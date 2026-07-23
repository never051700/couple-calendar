-- =====================================================================
-- 계정 삭제 시 공유 캘린더 소유권을 같은 트랜잭션에서 이전
-- =====================================================================

create or replace function public.handle_user_deletion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _space record;
  _replacement uuid;
begin
  -- auth.users 삭제와 같은 DB 트랜잭션에서 실행됩니다. 상대가 없는 공간은
  -- 기존 FK(on delete cascade)가 삭제하고, 상대가 있으면 소유권을 넘깁니다.
  for _space in
    select s.id
    from public.spaces s
    where s.created_by = old.id
    for update
  loop
    _replacement := null;
    select m.user_id
      into _replacement
    from public.space_members m
    where m.space_id = _space.id
      and m.user_id <> old.id
    order by m.joined_at, m.user_id
    limit 1;

    if _replacement is not null then
      update public.spaces
      set created_by = _replacement
      where id = _space.id and created_by = old.id;

      update public.space_members
      set role = 'owner'
      where space_id = _space.id and user_id = _replacement;
    end if;
  end loop;

  return old;
end;
$$;

revoke all on function public.handle_user_deletion() from public;

drop trigger if exists before_auth_user_deleted on auth.users;
create trigger before_auth_user_deleted
  before delete on auth.users
  for each row execute function public.handle_user_deletion();

-- Edge Function이 이 migration을 빼먹은 상태에서 파괴적인 삭제를 수행하지
-- 않도록 실제 trigger 활성 상태를 확인하는 service-role 전용 preflight입니다.
create or replace function public.account_deletion_ready()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = pg_catalog.to_regclass('auth.users')
      and t.tgname = 'before_auth_user_deleted'
      and not t.tgisinternal
      and t.tgenabled <> 'D'
  );
$$;

revoke all on function public.account_deletion_ready() from public, anon, authenticated;
grant execute on function public.account_deletion_ready() to service_role;
