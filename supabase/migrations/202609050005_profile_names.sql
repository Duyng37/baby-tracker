begin;

-- Metadata is fetched through get_workspace, not the event change log.
-- Compare the opened name under the family lock; an identical retry is harmless.
create function public.rename_family(p_family_id uuid, p_name text, p_expected_name text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_name text; v_next text := btrim(p_name);
begin
  perform private.lock_family(p_family_id, true);
  if coalesce(length(v_next), 0) not between 1 and 80 or p_expected_name is null then
    raise exception 'invalid_profile' using errcode = '22023';
  end if;
  select name into v_name from public.families where id = p_family_id;
  if v_name is distinct from p_expected_name and v_name is distinct from v_next then
    return jsonb_build_object('status', 'conflict');
  end if;
  update public.families set name = v_next where id = p_family_id;
  return jsonb_build_object('status', 'updated');
end;
$$;

create function public.rename_baby(p_family_id uuid, p_baby_id uuid, p_nickname text, p_expected_nickname text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v_name text; v_next text := btrim(p_nickname);
begin
  perform private.lock_family(p_family_id, true);
  if p_baby_id is null or coalesce(length(v_next), 0) not between 1 and 80 or p_expected_nickname is null then
    raise exception 'invalid_profile' using errcode = '22023';
  end if;
  select nickname into v_name from public.babies where id = p_baby_id and family_id = p_family_id;
  if not found then raise exception 'invalid_profile' using errcode = '22023'; end if;
  if v_name is distinct from p_expected_nickname and v_name is distinct from v_next then
    return jsonb_build_object('status', 'conflict');
  end if;
  update public.babies set nickname = v_next where id = p_baby_id and family_id = p_family_id;
  return jsonb_build_object('status', 'updated');
end;
$$;

revoke all on function public.rename_family(uuid, text, text) from public, anon, authenticated;
revoke all on function public.rename_baby(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.rename_family(uuid, text, text) to authenticated;
grant execute on function public.rename_baby(uuid, uuid, text, text) to authenticated;

commit;