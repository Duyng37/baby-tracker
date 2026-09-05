// Static regression guardrails ONLY. These do not parse/execute PostgreSQL,
// validate RLS at runtime, or replace supabase/tests/backend.sql.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

const directory = new URL('../supabase/migrations/', import.meta.url);
const files = readdirSync(directory).filter(name => name.endsWith('.sql')).sort();
const migrations = files.map(name => readFileSync(new URL(name, directory), 'utf8'));
const sql = migrations.join('\n').replace(/--[^\n]*/g, '').toLowerCase();
const schema = migrations[0].toLowerCase();
const sync = migrations[2].toLowerCase();
const rpcNames = [
  'create_family', 'add_baby', 'get_workspace', 'create_invitation', 'list_invitations',
  'revoke_invitation', 'accept_invitation', 'remove_family_member', 'apply_event', 'pull_changes',
  'rename_family', 'rename_baby',
];
const vaultNames = ['bff_session_create', 'bff_session_read', 'bff_session_claim', 'bff_session_save', 'bff_session_delete'];

test('static: ordered migrations are transaction-wrapped, with no destructive DDL', () => {
  assert.equal(files.length, 7);
  for (const migration of migrations) {
    const source = migration.replace(/--[^\n]*/g, '').trim();
    assert.match(source, /^begin;/i);
    assert.match(source, /commit;$/i);
    assert.doesNotMatch(source, /\b(drop|truncate)\s+(table|schema|database)\b/i);
    assert.equal((source.match(/\$\$/g) ?? []).length % 2, 0, 'balanced function delimiters');
  }
});

test('static: every application table enables RLS, no direct client writes', () => {
  const tables = [...sql.matchAll(/create table ((?:public|private)\.[a-z_]+)/g)].map(match => match[1]);
  assert.equal(tables.length, 9);
  for (const table of tables) assert.ok(sql.includes(`alter table ${table} enable row level security;`));
  assert.doesNotMatch(sql, /grant\s+(?:all|insert|update|delete)[^;]*to\s+(?:authenticated|anon|public)\s*;/);
  assert.doesNotMatch(sql, /create policy[^;]*for\s+(all|insert|update|delete)\b/);
  for (const table of ['families', 'family_members', 'babies', 'tracking_events']) {
    assert.match(sql, new RegExp(`create policy[^;]*on public\\.${table} for select to authenticated using \\(private\\.is_member`));
  }
});

test('static: every function fixes search_path; each public RPC has an explicit ACL', () => {
  const functions = [...sql.matchAll(/create (?:or replace )?function ([a-z_.]+)\(([\s\S]*?)\$\$;/g)];
  assert.equal(functions.length, 25);
  assert.deepEqual([...new Set(functions.filter(([_, name]) => name.startsWith('public.')).map(([_, name]) => name.slice(7)))].sort(), [...rpcNames, ...vaultNames].sort());
  for (const [, name, definition] of functions) {
    assert.match(definition, /set search_path = ''/);
    if (!name.startsWith('public.')) continue;
    assert.match(definition, /security definer/);
    const vault = vaultNames.includes(name.slice(7));
    if (!vault) assert.ok(definition.includes('auth.uid()') || definition.includes('private.lock_family('));
    const escaped = name.replaceAll('.', '\\.');
    assert.match(sql, new RegExp(`revoke all on function ${escaped}\\([^;]*\\) from public, anon, authenticated;`));
    assert.match(sql, new RegExp(`grant execute on function ${escaped}\\([^;]*\\) to ${vault ? 'service_role' : 'authenticated'};`));
  }
});

test('static: event aggregate uses composite FK, validated payload and active timer constraint', () => {
  assert.match(schema, /foreign key \(family_id, baby_id\) references public\.babies\(family_id, id\)/);
  assert.match(schema, /check \(private\.valid_payload\(type, started_at, ended_at, payload\) is true\)/);
  assert.match(schema, /create unique index tracking_events_active_timer_idx[\s\S]*?where type in \('sleep', 'breast'\) and ended_at is null and deleted_at is null/);
  assert.match(schema, /v_start is distinct from v_previous_end/);
});

test('static: idempotency checks access before replay, compares request hash and stores result', () => {
  assert.ok(sync.indexOf('perform private.lock_family(p_family_id)') < sync.indexOf('return v_previous.result'));
  assert.match(sync, /v_previous\.request_hash <> v_hash/);
  assert.match(sync, /auth\.uid\(\)::text \|\| p_operation_id::text, 12/);
  assert.match(sync, /insert into private\.sync_operations\(user_id, operation_id, device_id, family_id, request_hash, result\)/);
  assert.match(sync, /coalesce\(v_old\.revision, 0\) <> p_base_revision/);
});

test('static: global event-ID races have a lock AND scoped revision guard', () => {
  const lock = 'pg_catalog.hashtextextended(p_event_id::text, 13)';
  assert.ok(sync.includes(lock));
  assert.ok(sync.indexOf(lock) < sync.indexOf('select * into v_old'));
  assert.match(sync, /where public\.tracking_events\.family_id = p_family_id and public\.tracking_events\.baby_id = p_baby_id\s+and public\.tracking_events\.revision = p_base_revision/);
  assert.match(sync, /if v_event\.id is null then raise exception/);
});

test('static: cursor is transactional, paginated and precision-safe, never a sequence', () => {
  assert.doesNotMatch(sql, /\b(bigserial|serial|nextval)\b/);
  assert.match(sync, /update public\.families set sync_cursor = sync_cursor \+ 1/);
  assert.match(sync, /insert into private\.event_changes/);
  assert.match(sync, /'revision', p_event\.revision::text/);
  assert.match(sync, /limit p_limit \+ 1/);
  assert.match(sync, /'next_cursor', coalesce\(\(select max\(cursor\) from page\), p_after\)::text/);
});

test('static: invitation storage contains only a hash, and acceptance never updates roles', () => {
  const invitationTable = sql.match(/create table private\.invitations\s*\(([\s\S]*?)\n\);/)[1];
  assert.match(invitationTable, /token_hash bytea not null unique/);
  assert.doesNotMatch(invitationTable, /\btoken\s+text/);
  const acceptance = sql.match(/create function public\.accept_invitation\([\s\S]*?\$\$;/)[0];
  assert.match(acceptance, /'caregiver'\)\s+on conflict \(family_id, user_id\) do nothing/);
  assert.doesNotMatch(acceptance, /update public\.family_members/);
  assert.match(acceptance, /v_invite\.expires_at <= now\(\)/);
  assert.match(acceptance, /v_invite\.revoked_at is not null/);
  assert.match(acceptance, /return jsonb_build_object\('status', 'rate_limited'\)/);
});

test('static: runtime test script uses disposable fixtures and always rolls back', () => {
  const script = readFileSync(new URL('../supabase/tests/backend.sql', import.meta.url), 'utf8').replace(/--[^\n]*/g, '');
  assert.match(script, /^\s*begin;/i);
  assert.match(script, /set local role authenticated;/i);
  assert.match(script, /set local role anon;/i);
  assert.match(script, /rollback;/i);
  assert.doesNotMatch(script, /\bcommit;/i);
  assert.doesNotMatch(script, /raise (?:notice|log)[^;]*(token|payload)/i);
});

test('static: profile renames require owner locks, compare old names and never move babies', () => {
  for (const name of ['rename_family', 'rename_baby']) {
    const body = sql.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$\\$;`))[0];
    assert.match(body, /perform private\.lock_family\(p_family_id, true\)/);
    assert.match(body, /is distinct from p_expected_/);
    assert.match(body, /'status', 'conflict'/);
    assert.doesNotMatch(body, /update public\.tracking_events|set family_id|set id/);
  }
  const baby = sql.match(/create function public\.rename_baby\([\s\S]*?\$\$;/)[0];
  assert.match(baby, /where id = p_baby_id and family_id = p_family_id/);
});

test('static: care migration only broadens event types and planned-time validation in apply_event', () => {
  const previous = migrations[5].match(/create or replace function public\.apply_event[\s\S]*?\$\$;/)[0];
  const care = migrations[6].match(/create or replace function public\.apply_event[\s\S]*?\$\$;/)[0];
  assert.equal(care, previous.replace("'diaper', 'vaccination')", "'diaper', 'vaccination', 'medication', 'meal', 'growth', 'activity')")
    .replace("p_event->>'type' = 'vaccination'", "p_event->>'type' in ('vaccination', 'medication')"));
  const testSql = readFileSync(new URL('../supabase/tests/care-events.sql', import.meta.url), 'utf8');
  assert.match(testSql, /rollback;/i); assert.doesNotMatch(testSql, /commit;/i);
});