-- Synthetic data only; runs in the disposable database and rolls back all writes.
begin;
create function pg_temp.assert_true(p_value boolean, p_label text) returns void language plpgsql as $$
begin
  if p_value is not true then raise exception 'FAILED: %', p_label; end if;
end;
$$;
create function pg_temp.expect_error(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAILED: %, unexpected SQLSTATE %', p_label, sqlstate;
  end;
  raise exception 'FAILED: %, expected error was not raised', p_label;
end;
$$;
create function pg_temp.vaccination(p_status text default 'planned', p_start text default '2099-01-01T02:00:00Z') returns jsonb language sql as $$
  select jsonb_build_object('type', 'vaccination', 'started_at', p_start, 'ended_at', null, 'note', '', 'deleted', false,
    'payload', jsonb_build_object('vaccine', 'Test vaccine', 'dose', 'Dose 1', 'status', p_status, 'location', 'Test clinic'));
$$;
create function pg_temp.apply_vaccination(p_body jsonb, p_base bigint default 0,
  p_id uuid default 'eeeeeeee-0000-4000-8000-000000000001',
  p_baby uuid default 'aaaaaaaa-0000-4000-8000-000000000001') returns jsonb language sql as $$
  select public.apply_event(gen_random_uuid(), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_baby, p_id, p_base, p_body);
$$;

insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'), ('33333333-3333-4333-8333-333333333333');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); end $$;
do $$ begin
  perform public.create_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Family A', 'Baby A');
  perform public.add_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000002', 'Sibling');
end $$;

do $$
declare v_result jsonb; v_retry jsonb; v_operation uuid := gen_random_uuid(); v_device uuid := gen_random_uuid(); v_body jsonb := pg_temp.vaccination();
begin
  v_result := public.apply_event(v_operation, v_device, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 0, v_body);
  v_retry := public.apply_event(v_operation, v_device, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 0, v_body);
  perform pg_temp.assert_true(v_result->>'status' = 'accepted' and v_result->'event'->'payload' = v_body->'payload', 'future vaccination accepted');
  perform pg_temp.assert_true(v_result = v_retry and v_retry->>'cursor' = '1', 'vaccination retry idempotent');
  perform pg_temp.assert_true(pg_temp.apply_vaccination(v_body, 0, gen_random_uuid())->>'status' = 'accepted', 'multiple plans are not timers');
  perform pg_temp.assert_true(pg_temp.apply_vaccination(v_body, 0, gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000002')->>'status' = 'accepted', 'sibling has separate vaccination');
  perform pg_temp.assert_true(pg_temp.apply_vaccination(pg_temp.vaccination('completed', '2020-01-01T02:00:00Z'), 1)->'event'->>'revision' = '2', 'plan completed on same event');
  perform pg_temp.assert_true(pg_temp.apply_vaccination(v_body, 1)->>'status' = 'conflict', 'stale revision conflicts');
  perform pg_temp.assert_true(pg_temp.apply_vaccination(pg_temp.vaccination('completed', '2020-01-01T02:00:00Z') || '{"deleted":true}', 2)->'event'->>'deleted_at' is not null, 'vaccination soft deleted');
  perform pg_temp.assert_true(pg_temp.apply_vaccination(pg_temp.vaccination('completed', '2020-01-01T02:00:00Z'), 3)->'event'->>'revision' = '4', 'vaccination deletion undone');
  perform pg_temp.assert_true((select count(*) = 3 from public.tracking_events), 'completion and undo do not duplicate doses');
  perform pg_temp.assert_true(jsonb_array_length(public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->'changes') = 6, 'vaccination changes available to other devices');
end $$;

-- All required keys and payload limits are checked by the same write RPC.
do $$
declare v_payload jsonb; v_key text; v_body jsonb := pg_temp.vaccination();
begin
  foreach v_payload in array array[
    '{"vaccine":""}'::jsonb, '{"vaccine":null}', '{"vaccine":42}', '{"dose":null}', '{"location":[]}',
    '{"status":"invalid"}', '{"status":null}', '{"extra":"no"}',
    jsonb_build_object('vaccine', repeat('x', 121)), jsonb_build_object('dose', repeat('x', 41)), jsonb_build_object('location', repeat('x', 161))
  ] loop
    perform pg_temp.expect_error(format('select pg_temp.apply_vaccination(%L, 0, gen_random_uuid())',
      jsonb_set(v_body, '{payload}', v_body->'payload' || v_payload)), '22023', 'invalid vaccination payload rejected');
  end loop;
  foreach v_key in array array['vaccine', 'dose', 'status', 'location'] loop
    perform pg_temp.expect_error(format('select pg_temp.apply_vaccination(%L, 0, gen_random_uuid())',
      jsonb_set(v_body, '{payload}', (v_body->'payload') - v_key)), '22023', 'missing vaccination field rejected');
  end loop;
end $$;
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination('completed'), 0, gen_random_uuid())$q$, '22023', 'future completed dose rejected');
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination() || '{"ended_at":"2099-01-01T03:00:00Z"}', 0, gen_random_uuid())$q$, '22023', 'vaccination cannot be a timer');
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination() || '{"type":"sleep","payload":{}}', 0, gen_random_uuid())$q$, '22023', 'future sleep still rejected');
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination() || '{"started_at":"not-a-date"}', 0, gen_random_uuid())$q$, '22023', 'invalid date rejected');
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination(), 0, gen_random_uuid(), gen_random_uuid())$q$, '22023', 'wrong baby rejected');
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination(), 4, 'eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002')$q$, '22023', 'cannot move event to sibling');
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination('planned', '2020-01-01T02:00:00Z') || '{"type":"sleep","payload":{}}', 4)$q$, '22023', 'event type remains immutable');
select pg_temp.expect_error($q$update public.tracking_events set payload = '{}'$q$, '42501', 'direct event writes denied');

reset role;
insert into public.family_members(family_id, user_id, role) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'caregiver');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true); end $$;
select pg_temp.assert_true(pg_temp.apply_vaccination(pg_temp.vaccination('completed', '2020-01-01T02:00:00Z'), 0, gen_random_uuid())->>'status' = 'accepted', 'caregiver can record vaccination');
reset role;
delete from public.family_members where user_id = '33333333-3333-4333-8333-333333333333';
set local role authenticated;
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination(), 0, gen_random_uuid())$q$, '42501', 'revoked caregiver denied');
do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); end $$;
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination(), 0, gen_random_uuid())$q$, '42501', 'foreign family writes denied');
select pg_temp.expect_error($q$select public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$, '42501', 'foreign family pull denied');
select pg_temp.assert_true((select count(*) = 0 from public.tracking_events), 'RLS hides vaccination records from nonmembers');
do $$ begin perform set_config('request.jwt.claim.sub', '', true); end $$;
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination(), 0, gen_random_uuid())$q$, '28000', 'vaccination requires identity');
set local role anon;
select pg_temp.expect_error($q$select pg_temp.apply_vaccination(pg_temp.vaccination(), 0, gen_random_uuid())$q$, '42501', 'anonymous vaccination denied');
rollback;