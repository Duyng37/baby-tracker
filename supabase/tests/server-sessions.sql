-- Disposable test DB only. No genuine cookies, tokens or user profiles.
begin;
create function pg_temp.assert_true(value boolean, label text) returns void language plpgsql as $$
begin if value is not true then raise exception 'FAILED: %', label; end if; end;
$$;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
do $$
declare f record;
begin
  for f in select oid from pg_proc where pronamespace = 'public'::regnamespace and proname like 'bff_session_%' loop
    perform pg_temp.assert_true(not has_function_privilege('anon', f.oid, 'execute'), 'anon cannot use vault RPC');
    perform pg_temp.assert_true(not has_function_privilege('authenticated', f.oid, 'execute'), 'user cannot use vault RPC');
    perform pg_temp.assert_true(has_function_privilege('service_role', f.oid, 'execute'), 'service can use vault RPC');
  end loop;
  perform pg_temp.assert_true(not has_table_privilege('authenticated', 'private.server_sessions', 'select'), 'user cannot read vault table');
  perform pg_temp.assert_true(not has_table_privilege('service_role', 'private.server_sessions', 'select'), 'service must use narrow vault RPC');
end;
$$;
set local role service_role;
do $$
declare
  hash text := repeat('a', 64);
  first_owner uuid := 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  next_owner uuid := 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
begin
  perform public.bff_session_create(hash, '11111111-1111-4111-8111-111111111111', repeat('x', 64), now() - interval '1 minute');
  perform pg_temp.assert_true(public.bff_session_read(hash)->>'user_id' = '11111111-1111-4111-8111-111111111111', 'session stored');
  perform pg_temp.assert_true(not public.bff_session_claim(hash, first_owner, repeat('z', 64)), 'stale snapshot cannot claim lease');
  perform pg_temp.assert_true(public.bff_session_claim(hash, first_owner, repeat('x', 64)), 'first worker gets refresh lease');
  perform pg_temp.assert_true(not public.bff_session_claim(hash, next_owner, repeat('x', 64)), 'second worker cannot get lease');
  perform pg_temp.assert_true(not public.bff_session_save(hash, next_owner, repeat('y', 64), now() + interval '1 hour'), 'wrong worker cannot save');
  perform pg_temp.assert_true(public.bff_session_save(hash, first_owner, repeat('y', 64), now() + interval '1 hour'), 'owner can save');
  perform pg_temp.assert_true(not public.bff_session_claim(hash, next_owner, repeat('y', 64)), 'stale reader cannot refresh fresh token');
  perform public.bff_session_delete(hash);
  perform pg_temp.assert_true(public.bff_session_read(hash) is null, 'logout deletes all cookie copies');
  perform pg_temp.assert_true(not public.bff_session_save(hash, first_owner, repeat('z', 64), now() + interval '1 hour'), 'save cannot resurrect logout');
end;
$$;
reset role;
-- Advance lease/absolute expiry deterministically, without sleep or clock changes.
select public.bff_session_create(repeat('b', 64), '11111111-1111-4111-8111-111111111111', repeat('x', 64), now());
update private.server_sessions set refresh_owner = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', refresh_until = now() - interval '1 second';
select pg_temp.assert_true(public.bff_session_claim(repeat('b', 64), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('x', 64)), 'expired lease recoverable');
select pg_temp.assert_true(not public.bff_session_save(repeat('b', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('x', 64), now() + interval '1 hour'), 'old lease cannot overwrite successor');
update private.server_sessions set expires_at = now() - interval '1 second';
select pg_temp.assert_true(public.bff_session_read(repeat('b', 64)) is null, 'expired session unreadable');
select pg_temp.assert_true(not public.bff_session_claim(repeat('b', 64), 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', repeat('x', 64)), 'expired session cannot refresh');
select pg_temp.assert_true(not public.bff_session_save(repeat('b', 64), 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', repeat('x', 64), now() + interval '1 hour'), 'expired session cannot renew');
rollback;