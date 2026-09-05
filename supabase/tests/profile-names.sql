-- Disposable fixture only. All metadata and journal writes roll back.
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

insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222'), ('33333333-3333-4333-8333-333333333333');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); end $$;
do $$ begin
  perform public.create_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Family A', 'Baby A');
  perform public.add_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000002', 'Sibling');
  perform public.apply_event(gen_random_uuid(), gen_random_uuid(), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    'aaaaaaaa-0000-4000-8000-000000000001', gen_random_uuid(), 0,
    '{"type":"sleep","started_at":"2020-01-01T10:00:00Z","ended_at":null,"payload":{},"note":"Keep journal","deleted":false}');
end $$;
do $$
declare v_family jsonb; v_baby jsonb; v_events jsonb;
begin
  select to_jsonb(f) into v_family from public.families f;
  select to_jsonb(b) into v_baby from public.babies b where id = 'aaaaaaaa-0000-4000-8000-000000000001';
  select jsonb_agg(to_jsonb(e)) into v_events from public.tracking_events e;
  perform pg_temp.assert_true(public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '  New family  ', 'Family A')->>'status' = 'updated', 'owner renames family');
  perform pg_temp.assert_true(public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'New family', 'Family A')->>'status' = 'updated', 'family rename retry');
  perform pg_temp.assert_true(public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Stale family', 'Family A')->>'status' = 'conflict', 'stale family rename rejected');
  perform pg_temp.assert_true(public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', '  New baby  ', 'Baby A')->>'status' = 'updated', 'owner renames baby');
  perform pg_temp.assert_true(public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'New baby', 'Baby A')->>'status' = 'updated', 'baby rename retry');
  perform pg_temp.assert_true(public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Stale baby', 'Baby A')->>'status' = 'conflict', 'stale baby rename rejected');
  perform pg_temp.assert_true((select name = 'New family' and to_jsonb(f) - 'name' = v_family - 'name' from public.families f), 'family metadata other than name unchanged');
  perform pg_temp.assert_true((select nickname = 'New baby' and to_jsonb(b) - 'nickname' = v_baby - 'nickname' from public.babies b where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'baby metadata other than name unchanged');
  perform pg_temp.assert_true((select jsonb_agg(to_jsonb(e)) = v_events from public.tracking_events e), 'rename preserves active timer and journal');
  perform pg_temp.assert_true((select nickname = 'Sibling' from public.babies where id = 'aaaaaaaa-0000-4000-8000-000000000002'), 'rename does not affect sibling');
  perform pg_temp.assert_true(public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000002', 'New sibling', 'Sibling')->>'status' = 'updated', 'owner can rename any sibling');
  perform pg_temp.assert_true(public.get_workspace()->'families'->0->>'name' = 'New family', 'workspace includes renamed family');
  perform pg_temp.assert_true(exists(select 1 from jsonb_array_elements(public.get_workspace()->'babies') b where b->>'nickname' = 'New baby'), 'workspace includes renamed baby');
end $$;

do $$
declare v_name text;
begin
  foreach v_name in array array['', '   ', repeat('x', 81), null] loop
    perform pg_temp.expect_error(format('select public.rename_family(%L, %L, %L)', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', v_name, 'New family'), '22023', 'invalid family name rejected');
    perform pg_temp.expect_error(format('select public.rename_baby(%L, %L, %L, %L)', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', v_name, 'New baby'), '22023', 'invalid baby name rejected');
  end loop;
end $$;
select pg_temp.expect_error($q$select public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Name', null)$q$, '22023', 'family original name required');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Name', null)$q$, '22023', 'baby original name required');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gen_random_uuid(), 'Name', 'Old')$q$, '22023', 'missing baby rejected');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'Name', 'Old')$q$, '22023', 'null baby rejected');
select pg_temp.expect_error($q$update public.families set name = 'Direct'$q$, '42501', 'direct family rename forbidden');
select pg_temp.expect_error($q$update public.babies set nickname = 'Direct'$q$, '42501', 'direct baby rename forbidden');

do $$ begin perform set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true); end $$;
do $$ begin perform public.create_family('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'bbbbbbbb-0000-4000-8000-000000000001', 'Family B', 'Baby B'); end $$;
select pg_temp.expect_error($q$select public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Foreign', 'New family')$q$, '42501', 'foreign family rename denied');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Foreign', 'New baby')$q$, '42501', 'foreign baby rename denied');
select pg_temp.expect_error($q$select public.rename_baby('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'aaaaaaaa-0000-4000-8000-000000000001', 'Foreign', 'New baby')$q$, '22023', 'baby cannot be renamed through another family');

reset role;
insert into public.family_members(family_id, user_id, role) values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '33333333-3333-4333-8333-333333333333', 'caregiver');
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true); end $$;
select pg_temp.expect_error($q$select public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Caregiver', 'New family')$q$, '42501', 'caregiver cannot rename family');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Caregiver', 'New baby')$q$, '42501', 'caregiver cannot rename baby');

reset role;
delete from public.family_members where family_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' and user_id = '11111111-1111-4111-8111-111111111111';
set local role authenticated;
do $$ begin perform set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true); end $$;
select pg_temp.expect_error($q$select public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'New family', 'Family A')$q$, '42501', 'revoked owner cannot retry family rename');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'New baby', 'Baby A')$q$, '42501', 'revoked owner cannot retry baby rename');
do $$ begin perform set_config('request.jwt.claim.sub', '', true); end $$;
select pg_temp.expect_error($q$select public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Name', 'Old')$q$, '28000', 'family rename requires identity');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Name', 'Old')$q$, '28000', 'baby rename requires identity');
set local role anon;
select pg_temp.expect_error($q$select public.rename_family('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Name', 'Old')$q$, '42501', 'anonymous family RPC denied');
select pg_temp.expect_error($q$select public.rename_baby('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'aaaaaaaa-0000-4000-8000-000000000001', 'Name', 'Old')$q$, '42501', 'anonymous baby RPC denied');

rollback;