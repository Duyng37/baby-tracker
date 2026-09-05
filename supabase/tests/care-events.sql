-- Synthetic fixtures in the disposable test database only.
begin;
create or replace function pg_temp.assert_true(p_value boolean, p_label text) returns void language plpgsql as $$
begin
  if p_value is not true then raise exception 'FAILED: %', p_label; end if;
end;
$$;
create or replace function pg_temp.expect_error(p_sql text, p_state text, p_label text) returns void language plpgsql as $$
begin
  begin execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAILED: %, unexpected SQLSTATE %', p_label, sqlstate;
  end;
  raise exception 'FAILED: %, expected error was not raised', p_label;
end;
$$;
create function pg_temp.care(p_type text, p_payload jsonb, p_start text default '2020-01-01T02:00:00Z') returns jsonb language sql as $$
  select jsonb_build_object('type', p_type, 'started_at', p_start, 'ended_at', null, 'note', '', 'deleted', false, 'payload', p_payload);
$$;
create function pg_temp.apply_care(p_body jsonb, p_base bigint default 0,
  p_id uuid default gen_random_uuid(), p_baby uuid default 'aaaaaaaa-0000-4000-8000-000000000001') returns jsonb language sql as $$
  select public.apply_event(gen_random_uuid(), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_baby, p_id, p_base, p_body);
$$;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'), ('22222222-2222-4222-8222-222222222222');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); end $$;
do $$ begin
  perform public.create_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Care Family', 'Baby A');
  perform public.add_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000002', 'Sibling');
end $$;

do $$
declare v_body jsonb; v_result jsonb; v_key text; v_id uuid; v_kind text;
begin
  foreach v_body in array array[
    pg_temp.care('medication', '{"name":"Test medicine","dose":"As prescribed","status":"planned"}', '2099-01-01T02:00:00Z'),
    pg_temp.care('medication', '{"name":"Test medicine","dose":"","status":"completed"}'),
    pg_temp.care('meal', '{"food":"Porridge","amount":"Half bowl"}'),
    pg_temp.care('growth', '{"height_cm":65.5,"weight_kg":7.25}'),
    pg_temp.care('growth', '{"height_cm":null,"weight_kg":7.25}'),
    pg_temp.care('growth', '{"height_cm":65.5,"weight_kg":null}'),
    pg_temp.care('activity', '{"kind":"tummy_time","duration_minutes":10}')
  ] loop
    v_id := gen_random_uuid();
    v_result := pg_temp.apply_care(v_body, 0, v_id);
    perform pg_temp.assert_true(v_result->>'status' = 'accepted' and v_result->'event'->'payload' = v_body->'payload', 'care payload accepted');
    perform pg_temp.assert_true(pg_temp.apply_care(v_body, 0, v_id)->>'status' = 'conflict', 'care stale revision conflicts');
    perform pg_temp.assert_true(pg_temp.apply_care(v_body || '{"deleted":true}', 1, v_id)->'event'->>'deleted_at' is not null, 'care soft delete');
    perform pg_temp.assert_true(pg_temp.apply_care(v_body, 2, v_id)->'event'->>'revision' = '3', 'care undo same event');
    perform pg_temp.expect_error(format('select pg_temp.apply_care(%L, 3, %L, %L)', v_body, v_id, 'aaaaaaaa-0000-4000-8000-000000000002'), '22023', 'care cannot move baby');
    perform pg_temp.expect_error(format('select pg_temp.apply_care(%L)', jsonb_set(v_body, '{payload}', v_body->'payload' || '{"extra":true}')), '22023', 'care extra key rejected');
    for v_key in select jsonb_object_keys(v_body->'payload') loop
      perform pg_temp.expect_error(format('select pg_temp.apply_care(%L)', jsonb_set(v_body, '{payload}', (v_body->'payload') - v_key)), '22023', 'care missing key rejected');
    end loop;
    perform pg_temp.expect_error(format('select pg_temp.apply_care(%L)', v_body || jsonb_build_object('ended_at', v_body->>'started_at')), '22023', 'care never a timer');
  end loop;
  foreach v_kind in array array['bath', 'tummy_time', 'outdoor', 'indoor', 'brushing_teeth'] loop
    perform pg_temp.assert_true(pg_temp.apply_care(pg_temp.care('activity', jsonb_build_object('kind', v_kind, 'duration_minutes', null)))->>'status' = 'accepted', 'all care activities accepted');
  end loop;
  perform pg_temp.assert_true(jsonb_array_length(public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->'changes') = 26, 'care changes available to sync');
end $$;

do $$
declare v_body jsonb;
begin
  foreach v_body in array array[
    pg_temp.care('medication', '{"name":" ","dose":"","status":"planned"}'),
    pg_temp.care('medication', '{"name":42,"dose":"","status":"planned"}'),
    pg_temp.care('medication', '{"name":"Test","dose":null,"status":"planned"}'),
    pg_temp.care('medication', '{"name":"Test","dose":"","status":"invalid"}'),
    pg_temp.care('medication', jsonb_build_object('name', repeat('x', 121), 'dose', '', 'status', 'planned')),
    pg_temp.care('medication', jsonb_build_object('name', 'Test', 'dose', repeat('x', 81), 'status', 'planned')),
    pg_temp.care('medication', '{"name":"Test","dose":"","status":"completed"}', '2099-01-01T02:00:00Z'),
    pg_temp.care('meal', '{"food":"","amount":""}'), pg_temp.care('meal', '{"food":null,"amount":""}'),
    pg_temp.care('meal', '{"food":"Test","amount":42}'),
    pg_temp.care('meal', jsonb_build_object('food', repeat('x', 161), 'amount', '')),
    pg_temp.care('meal', jsonb_build_object('food', 'Test', 'amount', repeat('x', 81))),
    pg_temp.care('meal', '{"food":"Test","amount":""}', '2099-01-01T02:00:00Z'),
    pg_temp.care('growth', '{"height_cm":null,"weight_kg":null}'), pg_temp.care('growth', '{"height_cm":0,"weight_kg":7}'),
    pg_temp.care('growth', '{"height_cm":251,"weight_kg":7}'), pg_temp.care('growth', '{"height_cm":65,"weight_kg":301}'),
    pg_temp.care('growth', '{"height_cm":65,"weight_kg":-1}'), pg_temp.care('growth', '{"height_cm":"65","weight_kg":7}'),
    pg_temp.care('growth', '{"height_cm":65,"weight_kg":7}', '2099-01-01T02:00:00Z'),
    pg_temp.care('activity', '{"kind":"unknown","duration_minutes":10}'),
    pg_temp.care('activity', '{"kind":"bath","duration_minutes":0}'), pg_temp.care('activity', '{"kind":"bath","duration_minutes":1441}'),
    pg_temp.care('activity', '{"kind":"bath","duration_minutes":"10"}'),
    pg_temp.care('activity', '{"kind":"bath","duration_minutes":10}', '2099-01-01T02:00:00Z')
  ] loop
    perform pg_temp.expect_error(format('select pg_temp.apply_care(%L)', v_body), '22023', 'invalid care payload rejected');
  end loop;
end $$;

do $$
declare v_id uuid := gen_random_uuid(); v_op uuid := gen_random_uuid(); v_result jsonb; v_retry jsonb;
  v_body jsonb := pg_temp.care('medication', '{"name":"Test","dose":"","status":"planned"}', '2099-01-01T02:00:00Z');
begin
  v_result := public.apply_event(v_op, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', v_id, 0, v_body);
  v_retry := public.apply_event(v_op, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', v_id, 0, v_body);
  perform pg_temp.assert_true(v_result = v_retry, 'medication retry idempotent');
  perform pg_temp.assert_true(pg_temp.apply_care(pg_temp.care('medication', '{"name":"Test","dose":"","status":"completed"}'), 1, v_id)->'event'->>'revision' = '2', 'medication completed on same id');
  perform pg_temp.expect_error(format('select pg_temp.apply_care(%L, 2, %L)', pg_temp.care('meal', '{"food":"Test","amount":""}'), v_id), '22023', 'care type immutable');
end $$;
select pg_temp.expect_error($q$update public.tracking_events set payload = '{}'$q$, '42501', 'care direct writes denied');
do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); end $$;
select pg_temp.expect_error($q$select pg_temp.apply_care(pg_temp.care('meal', '{"food":"Test","amount":""}'))$q$, '42501', 'care foreign family denied');
select pg_temp.assert_true((select count(*) = 0 from public.tracking_events), 'care RLS hides other family records');
set local role anon;
select pg_temp.expect_error($q$select pg_temp.apply_care(pg_temp.care('meal', '{"food":"Test","amount":""}'))$q$, '42501', 'care anonymous write denied');
rollback;