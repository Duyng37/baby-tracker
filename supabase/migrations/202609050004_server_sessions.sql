-- Server-only vault. Browsers receive an opaque cookie, never Supabase tokens.
begin;
create table private.server_sessions (
  id_hash text primary key check (id_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_tokens text not null check (length(encrypted_tokens) between 32 and 32768),
  access_expires_at timestamptz not null,
  expires_at timestamptz not null default (now() + interval '30 days'),
  refresh_owner uuid,
  refresh_until timestamptz
);
alter table private.server_sessions enable row level security;
revoke all on private.server_sessions from public, anon, authenticated, service_role;
create index server_sessions_expiry_idx on private.server_sessions(expires_at);

create function public.bff_session_create(p_hash text, p_user uuid, p_tokens text, p_access_expiry timestamptz)
returns void language sql security definer set search_path = '' as $$
  insert into private.server_sessions(id_hash, user_id, encrypted_tokens, access_expires_at)
  values (p_hash, p_user, p_tokens, p_access_expiry);
$$;
create function public.bff_session_read(p_hash text)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('user_id', user_id, 'encrypted_tokens', encrypted_tokens,
    'access_expires_at', access_expires_at, 'expires_at', expires_at)
  from private.server_sessions where id_hash = p_hash and expires_at > now();
$$;
-- A database lease coordinates refresh across independent Vercel instances and
-- copied browser/PWA cookies. No in-memory-only locks or per-client refresh races.
create function public.bff_session_claim(p_hash text, p_owner uuid, p_expected_tokens text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.server_sessions set refresh_owner = p_owner, refresh_until = now() + interval '30 seconds'
  where id_hash = p_hash and expires_at > now() and (refresh_until is null or refresh_until < now())
    and encrypted_tokens = p_expected_tokens
    and access_expires_at <= now() + interval '60 seconds';
  return found;
end;
$$;
create function public.bff_session_save(p_hash text, p_owner uuid, p_tokens text, p_access_expiry timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.server_sessions set encrypted_tokens = p_tokens, access_expires_at = p_access_expiry,
    refresh_owner = null, refresh_until = null
  where id_hash = p_hash and refresh_owner = p_owner and refresh_until > now() and expires_at > now();
  return found; -- No stale worker or logout-in-flight may resurrect a session.
end;
$$;
create function public.bff_session_delete(p_hash text)
returns void language sql security definer set search_path = '' as $$
  delete from private.server_sessions where id_hash = p_hash;
$$;
revoke all on function public.bff_session_create(text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bff_session_read(text) from public, anon, authenticated;
revoke all on function public.bff_session_claim(text, uuid, text) from public, anon, authenticated;
revoke all on function public.bff_session_save(text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.bff_session_delete(text) from public, anon, authenticated;
grant execute on function public.bff_session_create(text, uuid, text, timestamptz) to service_role;
grant execute on function public.bff_session_read(text) to service_role;
grant execute on function public.bff_session_claim(text, uuid, text) to service_role;
grant execute on function public.bff_session_save(text, uuid, text, timestamptz) to service_role;
grant execute on function public.bff_session_delete(text) to service_role;
commit;