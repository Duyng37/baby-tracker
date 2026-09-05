begin;

-- Client-generated IDs make onboarding retryable after a lost HTTP response.
create function public.create_family(
  p_family_id uuid, p_baby_id uuid, p_name text, p_nickname text,
  p_timezone text default 'Asia/Ho_Chi_Minh', p_birth_date date default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_family public.families; v_baby public.babies;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  if p_family_id is null or p_baby_id is null
    or coalesce(length(btrim(p_name)), 0) not between 1 and 80
    or coalesce(length(btrim(p_nickname)), 0) not between 1 and 80
    or not exists(select 1 from pg_catalog.pg_timezone_names where name = p_timezone)
    or (p_birth_date is not null and (not isfinite(p_birth_date) or p_birth_date > current_date + 1)) then
    raise exception 'invalid_profile' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_family_id::text, 11));
  select * into v_family from public.families where id = p_family_id;
  if found then
    perform private.lock_family(p_family_id, true);
    select * into v_baby from public.babies where id = p_baby_id and family_id = p_family_id;
    if v_family.created_by <> auth.uid() or v_family.name <> btrim(p_name)
      or v_family.timezone <> p_timezone or v_baby.id is null
      or v_baby.nickname <> btrim(p_nickname) or v_baby.birth_date is distinct from p_birth_date then
      raise exception 'request_id_reused' using errcode = '22023';
    end if;
  else
    insert into public.families(id, name, timezone, created_by)
      values (p_family_id, btrim(p_name), p_timezone, auth.uid()) returning * into v_family;
    insert into public.family_members(family_id, user_id, role) values (p_family_id, auth.uid(), 'owner');
    insert into public.babies(id, family_id, nickname, birth_date)
      values (p_baby_id, p_family_id, btrim(p_nickname), p_birth_date) returning * into v_baby;
  end if;
  return jsonb_build_object('family_id', v_family.id, 'baby_id', v_baby.id);
end;
$$;

create function public.add_baby(p_family_id uuid, p_baby_id uuid, p_nickname text, p_birth_date date default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_baby public.babies;
begin
  perform private.lock_family(p_family_id, true);
  if p_baby_id is null or coalesce(length(btrim(p_nickname)), 0) not between 1 and 80
    or (p_birth_date is not null and (not isfinite(p_birth_date) or p_birth_date > current_date + 1)) then
    raise exception 'invalid_profile' using errcode = '22023';
  end if;
  select * into v_baby from public.babies where id = p_baby_id;
  if found then
    if v_baby.family_id <> p_family_id or v_baby.nickname <> btrim(p_nickname)
      or v_baby.birth_date is distinct from p_birth_date then
      raise exception 'request_id_reused' using errcode = '22023';
    end if;
  else
    insert into public.babies(id, family_id, nickname, birth_date)
      values (p_baby_id, p_family_id, btrim(p_nickname), p_birth_date) returning * into v_baby;
  end if;
  return to_jsonb(v_baby);
end;
$$;

create function public.get_workspace() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  return (
    select jsonb_build_object(
      'families', coalesce((select jsonb_agg(to_jsonb(f) || jsonb_build_object('sync_cursor', f.sync_cursor::text) order by f.created_at, f.id)
        from public.families f where private.is_member(f.id)), '[]'::jsonb),
      'babies', coalesce((select jsonb_agg(to_jsonb(b) order by b.created_at, b.id)
        from public.babies b where private.is_member(b.family_id)), '[]'::jsonb),
      'memberships', coalesce((select jsonb_agg(to_jsonb(m) order by m.family_id, m.user_id)
        from public.family_members m where private.is_member(m.family_id)), '[]'::jsonb)
    )
  );
end;
$$;

-- A bearer invitation is shown once to its creator, never stored/logged in clear.
-- Deliberately caregiver-only: accepting cannot promote someone to owner.
create function public.create_invitation(p_family_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_token text; v_invite private.invitations;
begin
  perform private.lock_family(p_family_id, true);
  if (select count(*) from private.invitations
    where family_id = p_family_id and created_at > now() - interval '1 hour') >= 20 then
    raise exception 'invitation_rate_limited' using errcode = 'P0001';
  end if;
  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into private.invitations(family_id, token_hash, created_by)
    values (p_family_id, sha256(convert_to(v_token, 'UTF8')), auth.uid()) returning * into v_invite;
  return jsonb_build_object('id', v_invite.id, 'token', v_token, 'expires_at', v_invite.expires_at);
end;
$$;

create function public.list_invitations(p_family_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_family(p_family_id, true);
  return (select coalesce(jsonb_agg(jsonb_build_object(
    'id', id, 'created_at', created_at, 'expires_at', expires_at,
    'accepted_at', accepted_at, 'revoked_at', revoked_at
  ) order by created_at desc), '[]'::jsonb) from private.invitations where family_id = p_family_id);
end;
$$;

create function public.revoke_invitation(p_family_id uuid, p_invitation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_family(p_family_id, true);
  update private.invitations set revoked_at = coalesce(revoked_at, now())
    where family_id = p_family_id and id = p_invitation_id;
end;
$$;

create function public.accept_invitation(p_token text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_invite private.invitations; v_attempts integer; v_family_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication_required' using errcode = '28000'; end if;
  insert into private.invitation_attempts(user_id, window_start, attempts) values (auth.uid(), now(), 1)
  on conflict (user_id) do update set
    attempts = case when private.invitation_attempts.window_start <= now() - interval '1 hour'
      then 1 else least(private.invitation_attempts.attempts + 1, 21) end,
    window_start = case when private.invitation_attempts.window_start <= now() - interval '1 hour'
      then now() else private.invitation_attempts.window_start end
  returning attempts into v_attempts;
  -- Return (not raise) for failed attempts so the rate-limit counter commits.
  if v_attempts > 20 then return jsonb_build_object('status', 'rate_limited'); end if;
  if p_token is null or length(p_token) <> 64 or p_token !~ '^[a-f0-9]{64}$' then
    return jsonb_build_object('status', 'invalid_invitation');
  end if;
  select family_id into v_family_id from private.invitations
    where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v_family_id is null then return jsonb_build_object('status', 'invalid_invitation'); end if;
  -- Same lock order as all family mutations, then recheck invitation state.
  perform 1 from public.families where id = v_family_id for update;
  select * into v_invite from private.invitations where token_hash = sha256(convert_to(p_token, 'UTF8'));
  if v_invite.revoked_at is not null or v_invite.accepted_at is not null or v_invite.expires_at <= now()
    or not exists(select 1 from public.family_members where family_id = v_family_id
      and user_id = v_invite.created_by and role = 'owner') then
    return jsonb_build_object('status', 'invalid_invitation');
  end if;
  insert into public.family_members(family_id, user_id, role) values (v_family_id, auth.uid(), 'caregiver')
    on conflict (family_id, user_id) do nothing;
  update private.invitations set accepted_at = now() where id = v_invite.id;
  return jsonb_build_object('status', 'accepted', 'family_id', v_family_id);
end;
$$;

create function public.remove_family_member(p_family_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.lock_family(p_family_id, true);
  if exists(select 1 from public.family_members where family_id = p_family_id and user_id = p_user_id and role = 'owner')
    and (select count(*) from public.family_members where family_id = p_family_id and role = 'owner') <= 1 then
    raise exception 'last_owner_required' using errcode = '22023';
  end if;
  delete from public.family_members where family_id = p_family_id and user_id = p_user_id;
  update private.invitations set revoked_at = coalesce(revoked_at, now())
    where family_id = p_family_id and created_by = p_user_id and accepted_at is null;
end;
$$;

revoke all on function public.create_family(uuid, uuid, text, text, text, date) from public, anon, authenticated;
revoke all on function public.add_baby(uuid, uuid, text, date) from public, anon, authenticated;
revoke all on function public.get_workspace() from public, anon, authenticated;
revoke all on function public.create_invitation(uuid) from public, anon, authenticated;
revoke all on function public.list_invitations(uuid) from public, anon, authenticated;
revoke all on function public.revoke_invitation(uuid, uuid) from public, anon, authenticated;
revoke all on function public.accept_invitation(text) from public, anon, authenticated;
revoke all on function public.remove_family_member(uuid, uuid) from public, anon, authenticated;

grant execute on function public.create_family(uuid, uuid, text, text, text, date) to authenticated;
grant execute on function public.add_baby(uuid, uuid, text, date) to authenticated;
grant execute on function public.get_workspace() to authenticated;
grant execute on function public.create_invitation(uuid) to authenticated;
grant execute on function public.list_invitations(uuid) to authenticated;
grant execute on function public.revoke_invitation(uuid, uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.remove_family_member(uuid, uuid) to authenticated;

commit;