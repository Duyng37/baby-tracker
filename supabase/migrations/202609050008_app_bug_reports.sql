begin;

create table private.app_bug_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null check (length(btrim(description)) between 10 and 2000),
  user_agent text not null check (length(user_agent) between 1 and 500),
  online boolean not null,
  installed boolean not null,
  created_at timestamptz not null default now()
);
create index app_bug_reports_user_time_idx on private.app_bug_reports(user_id, created_at desc);
alter table private.app_bug_reports enable row level security;
revoke all on table private.app_bug_reports from public, anon, authenticated;

create function public.report_app_bug(p_description text, p_user_agent text, p_online boolean, p_installed boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_description text := btrim(p_description);
begin
  if v_user is null then raise exception 'authentication_required' using errcode = '42501'; end if;
  if coalesce(length(v_description), 0) not between 10 and 2000
    or coalesce(length(p_user_agent), 0) not between 1 and 500
    or p_online is null or p_installed is null then
    raise exception 'invalid_report' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 31));
  if (select count(*) from private.app_bug_reports
      where user_id = v_user and created_at >= now() - interval '1 hour') >= 5 then
    return jsonb_build_object('status', 'rate_limited');
  end if;
  insert into private.app_bug_reports(user_id, description, user_agent, online, installed)
    values (v_user, v_description, p_user_agent, p_online, p_installed);
  return jsonb_build_object('status', 'created');
end;
$$;

revoke all on function public.report_app_bug(text, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.report_app_bug(text, text, boolean, boolean) to authenticated;

commit;