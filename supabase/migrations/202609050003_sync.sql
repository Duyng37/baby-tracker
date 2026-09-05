begin;

-- Bigints are strings on the RPC wire to avoid JavaScript precision loss.
create function private.event_json(p_event public.tracking_events) returns jsonb
language sql immutable set search_path = '' as $$
  select to_jsonb(p_event) || jsonb_build_object('revision', p_event.revision::text);
$$;
revoke all on function private.event_json(public.tracking_events) from public, anon, authenticated;

create function public.apply_event(
  p_operation_id uuid, p_device_id uuid, p_family_id uuid, p_baby_id uuid,
  p_event_id uuid, p_base_revision bigint, p_event jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_hash bytea;
  v_previous private.sync_operations;
  v_old public.tracking_events;
  v_event public.tracking_events;
  v_active public.tracking_events;
  v_result jsonb;
  v_cursor bigint;
  v_start timestamptz;
  v_end timestamptz;
  v_deleted boolean;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_operation_id is null or p_device_id is null or p_event_id is null or p_baby_id is null
    or p_family_id is null or p_base_revision is null or p_base_revision < 0
    or p_event is null or octet_length(p_event::text) > 70000 then
    raise exception 'invalid_operation' using errcode = '22023';
  end if;
  -- Also serialize reuse of one operation ID across different family locks.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(auth.uid()::text || p_operation_id::text, 12));
  perform private.lock_family(p_family_id);
  v_hash := sha256(convert_to(jsonb_build_object(
    'device_id', p_device_id, 'family_id', p_family_id, 'baby_id', p_baby_id,
    'event_id', p_event_id, 'base_revision', p_base_revision, 'event', p_event
  )::text, 'UTF8'));
  select * into v_previous from private.sync_operations
    where user_id = auth.uid() and operation_id = p_operation_id;
  if found then
    if v_previous.request_hash <> v_hash then
      raise exception 'operation_id_reused' using errcode = '22023';
    end if;
    return v_previous.result;
  end if;
  if not exists(select 1 from public.babies where family_id = p_family_id and id = p_baby_id) then
    raise exception 'invalid_event_scope' using errcode = '22023';
  end if;
  if jsonb_typeof(p_event) is distinct from 'object'
    or not (p_event ?& array['type', 'started_at', 'ended_at', 'payload', 'note', 'deleted'])
    or p_event - array['type', 'started_at', 'ended_at', 'payload', 'note', 'deleted'] <> '{}'::jsonb
    or coalesce(p_event->>'type', '') not in ('breast', 'bottle', 'sleep', 'diaper')
    or jsonb_typeof(p_event->'note') is distinct from 'string' or length(p_event->>'note') > 500
    or jsonb_typeof(p_event->'deleted') is distinct from 'boolean'
    or jsonb_typeof(p_event->'started_at') is distinct from 'string'
    or (p_event->>'started_at') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
    or (p_event->'ended_at' <> 'null'::jsonb and (
      jsonb_typeof(p_event->'ended_at') is distinct from 'string'
      or (p_event->>'ended_at') !~ '^\d{4}-\d{2}-\d{2}T.*(Z|[+-]\d{2}:\d{2})$'
    )) then raise exception 'invalid_event' using errcode = '22023'; end if;
  begin
    v_start := (p_event->>'started_at')::timestamptz;
    v_end := (p_event->>'ended_at')::timestamptz;
  exception when invalid_datetime_format or datetime_field_overflow then
    raise exception 'invalid_event_time' using errcode = '22023';
  end;
  v_deleted := (p_event->>'deleted')::boolean;
  if private.valid_payload(p_event->>'type', v_start, v_end, p_event->'payload') is not true
    or v_start > now() + interval '5 minutes' or v_end > now() + interval '5 minutes' then
    raise exception 'invalid_event' using errcode = '22023';
  end if;

  -- IDs are global. Different tenants guessing the same ID must not race an
  -- INSERT ... ON CONFLICT into updating a row checked before it was committed.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_event_id::text, 13));
  select * into v_old from public.tracking_events where id = p_event_id;
  if v_old.id is not null and (v_old.family_id <> p_family_id or v_old.baby_id <> p_baby_id) then
    raise exception 'invalid_event_scope' using errcode = '22023';
  end if;
  if v_old.id is not null and v_old.type <> p_event->>'type' then
    raise exception 'event_type_immutable' using errcode = '22023';
  end if;
  if coalesce(v_old.revision, 0) <> p_base_revision then
    v_result := jsonb_build_object('status', 'conflict', 'reason', 'revision',
      'event', case when v_old.id is not null then private.event_json(v_old) else null end);
  end if;
  if v_result is null and not v_deleted and v_end is null and p_event->>'type' in ('breast', 'sleep') then
    select * into v_active from public.tracking_events where family_id = p_family_id and baby_id = p_baby_id
      and type = p_event->>'type' and ended_at is null and deleted_at is null and id <> p_event_id;
    if found then
      v_result := jsonb_build_object('status', 'conflict', 'reason', 'active_timer',
        'event', case when v_old.id is not null then private.event_json(v_old) else null end,
        'active_event', private.event_json(v_active));
    end if;
  end if;
  if v_result is null then
    insert into public.tracking_events(
      id, family_id, baby_id, type, started_at, ended_at, payload, note,
      revision, created_by, updated_by, deleted_at
    ) values (
      p_event_id, p_family_id, p_baby_id, p_event->>'type', v_start, v_end, p_event->'payload', p_event->>'note',
      1, auth.uid(), auth.uid(), case when v_deleted then now() else null end
    ) on conflict (id) do update set
      started_at = excluded.started_at, ended_at = excluded.ended_at, payload = excluded.payload,
      note = excluded.note, revision = public.tracking_events.revision + 1,
      updated_by = auth.uid(), updated_at = now(), deleted_at = excluded.deleted_at
    where public.tracking_events.family_id = p_family_id and public.tracking_events.baby_id = p_baby_id
      and public.tracking_events.revision = p_base_revision
    returning * into v_event;
    if v_event.id is null then raise exception 'concurrent_event_change' using errcode = '40001'; end if;
    -- Transactional per-family counter, never a global sequence allocated before commit.
    update public.families set sync_cursor = sync_cursor + 1 where id = p_family_id returning sync_cursor into v_cursor;
    insert into private.event_changes(family_id, cursor, event) values (p_family_id, v_cursor, private.event_json(v_event));
    v_result := jsonb_build_object('status', 'accepted', 'event', private.event_json(v_event), 'cursor', v_cursor::text);
  end if;
  v_result := v_result || jsonb_build_object('operation_id', p_operation_id);
  insert into private.sync_operations(user_id, operation_id, device_id, family_id, request_hash, result)
    values (auth.uid(), p_operation_id, p_device_id, p_family_id, v_hash, v_result);
  return v_result;
end;
$$;

-- Initial bootstrap replays the retained change log from cursor 0. No GC yet.
-- One SQL snapshot for page + has_more; cursor advances only over returned rows.
create function public.pull_changes(p_family_id uuid, p_after bigint default 0, p_limit integer default 200)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if not private.is_member(p_family_id) then raise exception 'not_authorized' using errcode = '42501'; end if;
  if p_after is null or p_after < 0 or p_limit is null or p_limit not between 1 and 500
    or p_after > (select sync_cursor from public.families where id = p_family_id) then
    raise exception 'invalid_cursor_or_limit' using errcode = '22023';
  end if;
  return (
    with candidates as materialized (
      select cursor, event from private.event_changes where family_id = p_family_id and cursor > p_after
        order by cursor limit p_limit + 1
    ), page as (select cursor, event from candidates order by cursor limit p_limit)
    select jsonb_build_object(
      'changes', coalesce((select jsonb_agg(jsonb_build_object('cursor', cursor::text, 'event', event) order by cursor)
        from page), '[]'::jsonb),
      'next_cursor', coalesce((select max(cursor) from page), p_after)::text,
      'has_more', (select count(*) > p_limit from candidates)
    )
  );
end;
$$;

revoke all on function public.apply_event(uuid, uuid, uuid, uuid, uuid, bigint, jsonb) from public, anon, authenticated;
revoke all on function public.pull_changes(uuid, bigint, integer) from public, anon, authenticated;
grant execute on function public.apply_event(uuid, uuid, uuid, uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function public.pull_changes(uuid, bigint, integer) to authenticated;

commit;