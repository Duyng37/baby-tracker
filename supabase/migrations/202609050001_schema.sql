-- Run on a new Supabase project. All application writes go through checked RPCs.
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create table public.families (
  id uuid primary key,
  name text not null check (length(btrim(name)) between 1 and 80),
  timezone text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  sync_cursor bigint not null default 0 check (sync_cursor >= 0)
);

create table public.family_members (
  family_id uuid not null references public.families(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('owner', 'caregiver')),
  joined_at timestamptz not null default now(),
  primary key (family_id, user_id)
);
create index family_members_user_idx on public.family_members(user_id);

create table public.babies (
  id uuid primary key,
  family_id uuid not null references public.families(id),
  nickname text not null check (length(btrim(nickname)) between 1 and 80),
  birth_date date,
  created_at timestamptz not null default now(),
  unique (family_id, id)
);

-- Segments live inside the event payload: one atomic aggregate and revision.
-- Reject missing/extra payload keys, invalid values and discontinuous segments.
create function private.valid_payload(
  p_type text, p_start timestamptz, p_end timestamptz, p_payload jsonb
) returns boolean language plpgsql stable set search_path = '' as $$
declare
  v_segment jsonb;
  v_start timestamptz;
  v_end timestamptz;
  v_previous_end timestamptz := p_start;
  v_count integer := 0;
  v_total integer;
begin
  if p_start is null or not isfinite(p_start)
    or (p_end is not null and (not isfinite(p_end) or p_end < p_start))
    or jsonb_typeof(p_payload) is distinct from 'object'
    or octet_length(p_payload::text) > 65536 then return false; end if;
  if p_type = 'sleep' then return p_payload = '{}'::jsonb; end if;
  if p_type = 'bottle' then
    return p_end is null and p_payload - array['amount_ml', 'milk'] = '{}'::jsonb
      and jsonb_typeof(p_payload->'amount_ml') = 'number'
      and (p_payload->>'amount_ml')::numeric > 0
      and (p_payload->>'amount_ml')::numeric <= 2000
      and (p_payload->>'milk') in ('breast_milk', 'formula', 'mixed');
  end if;
  if p_type = 'diaper' then
    return p_end is null and p_payload - 'kind' = '{}'::jsonb
      and (p_payload->>'kind') in ('wet', 'dirty', 'mixed');
  end if;
  if p_type is distinct from 'breast'
    or p_payload - 'segments' <> '{}'::jsonb
    or jsonb_typeof(p_payload->'segments') is distinct from 'array' then return false; end if;
  v_total := jsonb_array_length(p_payload->'segments');
  if v_total not between 1 and 200 then return false; end if;
  for v_segment in select value from jsonb_array_elements(p_payload->'segments') loop
    v_count := v_count + 1;
    if jsonb_typeof(v_segment) is distinct from 'object'
      or not (v_segment ?& array['side', 'started_at', 'ended_at'])
      or v_segment - array['side', 'started_at', 'ended_at'] <> '{}'::jsonb
      or coalesce(v_segment->>'side', '') not in ('left', 'right')
      or jsonb_typeof(v_segment->'started_at') is distinct from 'string'
      or (v_segment->>'started_at') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
      or (v_segment->'ended_at' <> 'null'::jsonb and (
        jsonb_typeof(v_segment->'ended_at') is distinct from 'string'
        or (v_segment->>'ended_at') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
      )) then return false; end if;
    v_start := (v_segment->>'started_at')::timestamptz;
    v_end := (v_segment->>'ended_at')::timestamptz;
    if not isfinite(v_start) or v_start is distinct from v_previous_end
      or (v_end is not null and (not isfinite(v_end) or v_end < v_start))
      or (v_count < v_total and v_end is null) then return false; end if;
    v_previous_end := v_end;
  end loop;
  return v_previous_end is not distinct from p_end;
exception when invalid_text_representation or invalid_datetime_format
  or datetime_field_overflow or numeric_value_out_of_range then
  return false;
end;
$$;

create table public.tracking_events (
  id uuid primary key,
  family_id uuid not null,
  baby_id uuid not null,
  type text not null check (type in ('breast', 'bottle', 'sleep', 'diaper')),
  started_at timestamptz not null,
  ended_at timestamptz,
  payload jsonb not null,
  note text not null default '' check (length(note) <= 500),
  revision bigint not null check (revision > 0),
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (family_id, baby_id) references public.babies(family_id, id),
  check (private.valid_payload(type, started_at, ended_at, payload) is true)
);
create index tracking_events_baby_time_idx on public.tracking_events(family_id, baby_id, started_at desc);
create unique index tracking_events_active_timer_idx
  on public.tracking_events(family_id, baby_id, type)
  where type in ('sleep', 'breast') and ended_at is null and deleted_at is null;

create table private.sync_operations (
  user_id uuid not null references auth.users(id),
  operation_id uuid not null,
  device_id uuid not null,
  family_id uuid not null references public.families(id),
  request_hash bytea not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, operation_id)
);
create index sync_operations_family_idx on private.sync_operations(family_id);

create table private.event_changes (
  family_id uuid not null references public.families(id),
  cursor bigint not null,
  event jsonb not null,
  created_at timestamptz not null default now(),
  primary key (family_id, cursor)
);

create table private.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id),
  token_hash bytea not null unique,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '48 hours'),
  accepted_at timestamptz,
  revoked_at timestamptz
);
create index invitations_family_idx on private.invitations(family_id, created_at);
create table private.invitation_attempts (
  user_id uuid primary key references auth.users(id),
  window_start timestamptz not null,
  attempts integer not null
);

-- This definer helper avoids RLS recursion. It reveals only the caller's access.
create function private.is_member(p_family_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.family_members
    where family_id = p_family_id and user_id = auth.uid());
$$;

-- Every family mutation uses the same root-row lock, including member removal.
create function private.lock_family(p_family_id uuid, p_owner_only boolean default false)
returns void language plpgsql security definer set search_path = '' as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  -- Precheck prevents strangers from locking a family's row to deny service.
  if not private.is_member(p_family_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  perform 1 from public.families where id = p_family_id for update;
  select role into v_role from public.family_members
    where family_id = p_family_id and user_id = auth.uid();
  if v_role is null or (p_owner_only and v_role <> 'owner') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
end;
$$;

alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.babies enable row level security;
alter table public.tracking_events enable row level security;
alter table private.sync_operations enable row level security;
alter table private.event_changes enable row level security;
alter table private.invitations enable row level security;
alter table private.invitation_attempts enable row level security;

create policy families_read on public.families for select to authenticated using (private.is_member(id));
create policy members_read on public.family_members for select to authenticated using (private.is_member(family_id));
create policy babies_read on public.babies for select to authenticated using (private.is_member(family_id));
create policy events_read on public.tracking_events for select to authenticated using (private.is_member(family_id));

revoke all on public.families, public.family_members, public.babies, public.tracking_events
  from public, anon, authenticated;
grant select on public.families, public.family_members, public.babies, public.tracking_events to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_member(uuid) to authenticated;

commit;