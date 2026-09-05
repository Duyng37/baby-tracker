-- Integration tests for a disposable Supabase development project only.
-- No pgTAP dependency. SQL Editor or psql -v ON_ERROR_STOP=1 -f <this file>.
-- Fixtures and all tested mutations roll back. Never run against production.
begin;

create function pg_temp.assert_true(p_value boolean, p_label text) returns void
language plpgsql as $$
begin
  if p_value is not true then raise exception 'FAILED: %', p_label; end if;
end;
$$;
create function pg_temp.expect_error(p_sql text, p_state text, p_label text) returns void
language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAILED: %, unexpected SQLSTATE %', p_label, sqlstate;
  end;
  raise exception 'FAILED: %, expected error was not raised', p_label;
end;
$$;

-- These identities do not have passwords, email addresses or working sessions.
insert into auth.users(id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'),
  ('33333333-3333-4333-8333-333333333333');

create temporary table test_state(key text primary key, value jsonb);
grant all on test_state to authenticated;

set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); end $$;
do $$
declare v_result jsonb;
begin
  v_result := public.create_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Family A', 'Baby A');
  perform pg_temp.assert_true(v_result = public.create_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Family A', 'Baby A'), 'onboarding retry');
  perform public.add_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000002', 'Baby A2');
  perform pg_temp.assert_true((select count(*) = 2 from public.babies), 'multiple babies');
  perform pg_temp.assert_true((select role = 'owner' from public.family_members where user_id = auth.uid()), 'creator is owner');
  insert into test_state values ('invite', public.create_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
end $$;

do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); end $$;
do $$ begin
  perform public.create_family('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001', 'Family B', 'Baby B');
  perform pg_temp.assert_true((select count(*) = 1 from public.families), 'RLS family isolation');
  perform pg_temp.assert_true((select count(*) = 1 from public.babies), 'RLS baby isolation');
  perform pg_temp.assert_true((select count(*) = 1 from public.family_members), 'RLS member isolation');
  perform pg_temp.assert_true(jsonb_array_length(public.get_workspace()->'families') = 1, 'workspace isolation');
end $$;

select pg_temp.expect_error($q$select public.add_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'Forbidden')$q$, '42501', 'cross-family baby write');
select pg_temp.expect_error($q$select public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$, '42501', 'cross-family pull');
select pg_temp.expect_error($q$select public.create_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$, '42501', 'cross-family invitation');
select pg_temp.expect_error($q$update public.family_members set role = 'owner'$q$, '42501', 'direct role escalation');
select pg_temp.expect_error($q$delete from public.babies$q$, '42501', 'direct delete denied');
select pg_temp.expect_error($q$insert into public.family_members values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid(), 'owner', now())$q$, '42501', 'direct membership insert denied');
select pg_temp.expect_error($q$select * from private.invitations$q$, '42501', 'invitation hashes inaccessible');
select pg_temp.expect_error($q$select private.lock_family('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb')$q$, '42501', 'private write helper inaccessible');

do $$ begin perform set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true); end $$;
do $$
declare v_token text; v_result jsonb;
begin
  select value->>'token' into v_token from test_state where key = 'invite';
  v_result := public.accept_invitation(v_token);
  perform pg_temp.assert_true(v_result->>'status' = 'accepted', 'valid invitation accepted');
  perform pg_temp.assert_true(public.accept_invitation(v_token)->>'status' = 'invalid_invitation', 'single-use invitation');
  perform pg_temp.assert_true((select role = 'caregiver' from public.family_members where user_id = auth.uid()), 'invite never elevates role');
end $$;
select pg_temp.expect_error($q$select public.add_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'Forbidden')$q$, '42501', 'caregiver cannot add baby');
select pg_temp.expect_error($q$select public.create_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$, '42501', 'caregiver cannot invite');

-- Operation bodies contain no client-supplied identity or revision fields.
insert into test_state values ('body', '{"type":"bottle","started_at":"2020-01-01T10:00:00Z","ended_at":null,"payload":{"amount_ml":75.5,"milk":"formula"},"note":"","deleted":false}');
do $$
declare v_body jsonb; v_result jsonb; v_retry jsonb; v_op uuid := gen_random_uuid();
begin
  select value into v_body from test_state where key = 'body';
  insert into test_state values ('operation_id', to_jsonb(v_op));
  v_result := public.apply_event(v_op, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 0, v_body);
  v_retry := public.apply_event(v_op, 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 0, v_body);
  perform pg_temp.assert_true(v_result = v_retry, 'lost ACK retry returns identical result');
  perform pg_temp.assert_true(v_result->>'status' = 'accepted' and v_result->'event'->>'revision' = '1', 'first revision accepted');
  perform pg_temp.assert_true(v_result->'event'->>'created_by' = auth.uid()::text, 'identity comes from auth');
  perform pg_temp.assert_true((select count(*) = 1 from public.tracking_events), 'no duplicate on retry');
  perform pg_temp.assert_true(public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')->>'next_cursor' = '1', 'retry does not advance cursor');
end $$;

-- Helper supplies defaults, but still executes RPC as the authenticated caller.
create function pg_temp.apply_test_event(p_body jsonb, p_base bigint default 0,
  p_id uuid default 'eeeeeeee-0000-4000-8000-000000000001',
  p_baby uuid default 'aaaaaaaa-0000-4000-8000-000000000001') returns jsonb language sql as $$
  select public.apply_event(gen_random_uuid(), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', p_baby, p_id, p_base, p_body);
$$;

select pg_temp.expect_error($q$select public.apply_event((select (value #>> '{}')::uuid from test_state where key = 'operation_id'),
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 0,
  (select value || '{"note":"changed"}' from test_state where key = 'body'))$q$, '22023', 'changed payload under same operation ID');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value from test_state where key = 'body'), 0,
  gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000001')$q$, '22023', 'cross-family baby ID');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value from test_state where key = 'body'), 1,
  'eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002')$q$, '22023', 'event baby is immutable');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value || '{"created_by":"11111111-1111-4111-8111-111111111111"}' from test_state where key = 'body'), 1)$q$, '22023', 'forged created_by rejected');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value || '{"payload":{"milk":"formula"}}' from test_state where key = 'body'), 1)$q$, '22023', 'missing amount rejected');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value || '{"payload":{"amount_ml":0,"milk":"formula"}}' from test_state where key = 'body'), 1)$q$, '22023', 'zero amount rejected');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value || '{"started_at":"infinity"}' from test_state where key = 'body'), 1)$q$, '22023', 'infinite timestamp rejected');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value || '{"deleted":null}' from test_state where key = 'body'), 1)$q$, '22023', 'null deleted rejected');

do $$
declare v_body jsonb; v_result jsonb; v_page jsonb;
begin
  select value into v_body from test_state where key = 'body';
  v_result := pg_temp.apply_test_event(v_body || '{"note":"new"}', 1);
  perform pg_temp.assert_true(v_result->'event'->>'revision' = '2', 'update increments revision');
  v_result := pg_temp.apply_test_event(v_body || '{"note":"stale"}', 1);
  perform pg_temp.assert_true(v_result->>'status' = 'conflict' and v_result->'event'->>'note' = 'new', 'stale update preserves server');
  perform pg_temp.assert_true((select note = 'new' from public.tracking_events), 'conflict does not write');
  v_result := pg_temp.apply_test_event(v_body || '{"deleted":true}', 2);
  perform pg_temp.assert_true(v_result->'event'->>'deleted_at' is not null, 'soft delete retains tombstone');
  v_page := public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 2);
  perform pg_temp.assert_true(v_page->>'next_cursor' = '2' and (v_page->>'has_more')::boolean, 'page limit and cursor');
  v_page := public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 2, 2);
  perform pg_temp.assert_true(v_page->>'next_cursor' = '3' and not (v_page->>'has_more')::boolean, 'last page cursor');
  perform pg_temp.assert_true(v_page->'changes'->0->'event'->>'deleted_at' is not null, 'deleted row remains in pull');
  v_result := pg_temp.apply_test_event(v_body, 3);
  perform pg_temp.assert_true(v_result->'event'->>'revision' = '4' and v_result->'event'->>'deleted_at' is null, 'undo is compensating write');
end $$;

do $$
declare v_sleep jsonb; v_breast jsonb; v_result jsonb;
begin
  v_sleep := '{"type":"sleep","started_at":"2020-01-01T10:00:00Z","ended_at":null,"payload":{},"note":"","deleted":false}';
  v_result := pg_temp.apply_test_event(v_sleep, 0, 'eeeeeeee-0000-4000-8000-000000000002');
  perform pg_temp.assert_true(v_result->>'status' = 'accepted', 'sleep timer starts');
  v_result := pg_temp.apply_test_event(v_sleep, 0, gen_random_uuid());
  perform pg_temp.assert_true(v_result->>'reason' = 'active_timer', 'second timer conflicts');
  v_result := pg_temp.apply_test_event(v_sleep, 0, gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000002');
  perform pg_temp.assert_true(v_result->>'status' = 'accepted', 'different baby has independent timer');
  v_breast := '{"type":"breast","started_at":"2020-01-01T10:00:00Z","ended_at":null,"payload":{"segments":[{"side":"left","started_at":"2020-01-01T10:00:00Z","ended_at":null}]},"note":"","deleted":false}';
  v_result := pg_temp.apply_test_event(v_breast, 0, 'eeeeeeee-0000-4000-8000-000000000003');
  perform pg_temp.assert_true(v_result->>'status' = 'accepted', 'nursing may overlap sleep');
  insert into test_state values ('breast', v_breast);
  v_breast := v_breast || '{"ended_at":"2020-01-01T10:10:00Z","payload":{"segments":[{"side":"left","started_at":"2020-01-01T10:00:00Z","ended_at":"2020-01-01T10:05:00Z"},{"side":"right","started_at":"2020-01-01T10:05:00Z","ended_at":"2020-01-01T10:10:00Z"}]}}';
  v_result := pg_temp.apply_test_event(v_breast, 1, 'eeeeeeee-0000-4000-8000-000000000003');
  perform pg_temp.assert_true(v_result->'event'->>'revision' = '2', 'multi-segment nursing ends atomically');
end $$;
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select jsonb_set(value, '{payload,segments,0,started_at}', '"2020-01-01T10:01:00Z"') from test_state where key = 'breast'), 2, 'eeeeeeee-0000-4000-8000-000000000003')$q$, '22023', 'discontinuous segment rejected');
select pg_temp.expect_error($q$select public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', -1)$q$, '22023', 'negative cursor rejected');
select pg_temp.expect_error($q$select public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 0, 501)$q$, '22023', 'oversized page rejected');

do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); end $$;
select pg_temp.assert_true((select count(*) = 0 from public.tracking_events), 'RLS events hidden from other family');
select pg_temp.expect_error($q$select pg_temp.apply_test_event((select value from test_state where key = 'body'))$q$, '42501', 'cross-family event write denied');
select pg_temp.expect_error($q$select public.apply_event(gen_random_uuid(), 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001',
  'eeeeeeee-0000-4000-8000-000000000001', 4, (select value from test_state where key = 'body'))$q$, '22023', 'global event ID cannot move tenants');

do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); end $$;
select pg_temp.expect_error($q$select public.remove_family_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', auth.uid())$q$, '22023', 'last owner preserved');
do $$
declare v_invite jsonb;
begin
  v_invite := public.create_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  insert into test_state values ('revoked_invite', v_invite);
  perform public.revoke_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', (v_invite->>'id')::uuid);
  insert into test_state values ('expired_invite', public.create_invitation('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'));
  perform pg_temp.assert_true(not exists(select 1 from jsonb_array_elements(public.list_invitations('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')) i
    where i ? 'token' or i ? 'token_hash'), 'invite listing never exposes credentials');
end $$;
reset role;
update private.invitations set expires_at = now() - interval '1 minute'
  where id = (select (value->>'id')::uuid from test_state where key = 'expired_invite');
set local role authenticated;
do $$ begin perform public.remove_family_member('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333'); end $$;
do $$ begin perform set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true); end $$;
select pg_temp.assert_true(jsonb_array_length(public.get_workspace()->'families') = 0, 'revocation removes workspace');
do $$
declare v_token text;
begin
  select value->>'token' into v_token from test_state where key = 'revoked_invite';
  perform pg_temp.assert_true(public.accept_invitation(v_token)->>'status' = 'invalid_invitation', 'revoked invitation rejected');
  select value->>'token' into v_token from test_state where key = 'expired_invite';
  perform pg_temp.assert_true(public.accept_invitation(v_token)->>'status' = 'invalid_invitation', 'expired invitation rejected');
end $$;
select pg_temp.expect_error($q$select public.pull_changes('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')$q$, '42501', 'revoked member cannot pull');
select pg_temp.expect_error($q$select public.apply_event((select (value #>> '{}')::uuid from test_state where key = 'operation_id'),
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  'aaaaaaaa-0000-4000-8000-000000000001', 'eeeeeeee-0000-4000-8000-000000000001', 0,
  (select value from test_state where key = 'body'))$q$, '42501', 'revocation also denies old ACK replay');

do $$
declare v_result jsonb;
begin
  for i in 1..21 loop v_result := public.accept_invitation('invalid'); end loop;
  perform pg_temp.assert_true(v_result->>'status' = 'rate_limited', 'invalid attempts persist rate limit');
end $$;

reset role;
-- Database checks compare atomic logs with rows, not only RPC return values.
select pg_temp.assert_true((select sync_cursor = 8 from public.families where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'only accepted writes increment cursor');
select pg_temp.assert_true((select count(*) = 8 from private.event_changes), 'one log entry per accepted write');
select pg_temp.assert_true((select count(*) = 10 from private.sync_operations), 'ACKs and conflicts durable; rejected writes atomic');

set local role anon;
select pg_temp.expect_error($q$select * from public.babies$q$, '42501', 'anonymous table access denied');
select pg_temp.expect_error($q$select public.get_workspace()$q$, '42501', 'anonymous RPC access denied');
select pg_temp.expect_error($q$select public.accept_invitation('invalid')$q$, '42501', 'anonymous invitation attempt denied');
reset role;
rollback;
select 'Backend integration assertions passed; all fixtures rolled back.' as result;