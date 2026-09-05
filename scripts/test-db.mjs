// Disposable PostgreSQL only; no remote URL, credentials or existing DB accepted.
// Requires an already installed postgres:17 image. Never pulls an image for you.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

const image = 'postgres:17';
const run = (args, input) => spawnSync('docker', args, {
  input, encoding: 'utf8', timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
  windowsHide: true,
});
let containerId;

function executeSql(source, label) {
  const result = run(['exec', '-i', containerId, 'psql', '-X', '-q', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'], source);
  if (result.status !== 0) {
    // Do not echo SQL, query results, function context or connection details.
    const line = result.stderr?.match(/^ERROR:.*$/m)?.[0];
    const safeLabel = line?.match(/^ERROR:\s+FAILED: ([A-Za-z0-9 ,;:.()_-]+)$/)?.[1];
    throw new Error(`${label} failed.${safeLabel ? ` Assertion: ${safeLabel}` : ' Inspect SQL in the disposable test environment.'}`);
  }
  console.log(`PASS: ${label}`);
}

try {
  if (process.argv.length > 2) throw new Error('No arguments accepted: this runner never targets an existing database.');
  if (run(['version', '--format', '{{.Server.Version}}']).status !== 0) {
    throw new Error('Docker Engine is not running. Start Docker Desktop, then rerun npm run test:db.');
  }
  if (run(['image', 'inspect', image, '--format', '{{.Id}}']).status !== 0) {
    throw new Error('postgres:17 is not installed. Approve/download the test image first; this runner does not pull dependencies.');
  }
  const started = run(['run', '--detach', '--rm', '--network', 'none', '--pull', 'never',
    '--name', `baby-tracker-test-${randomUUID()}`, '--tmpfs', '/var/lib/postgresql/data',
    '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', image]);
  const id = started.stdout?.trim();
  if (started.status !== 0 || !/^[a-f0-9]{64}$/.test(id ?? '')) throw new Error('Could not create the disposable test container.');
  containerId = id;
  let ready = false;
  for (let attempt = 0; attempt < 40; attempt++) {
    // TCP inside the network-isolated container avoids the temporary init server.
    if (run(['exec', containerId, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres']).status === 0) {
      ready = true;
      break;
    }
    await delay(500);
  }
  if (!ready) throw new Error('Disposable PostgreSQL did not become ready.');
  executeSql(readFileSync(new URL('./test-auth-bootstrap.sql', import.meta.url), 'utf8'), 'minimal auth fixture (NOT GoTrue)');
  const directory = new URL('../supabase/migrations/', import.meta.url);
  for (const file of readdirSync(directory).filter(name => name.endsWith('.sql')).sort()) {
    executeSql(readFileSync(new URL(file, directory), 'utf8'), file);
  }
  executeSql(readFileSync(new URL('../supabase/tests/backend.sql', import.meta.url), 'utf8'), 'backend integration assertions');
  executeSql(readFileSync(new URL('../supabase/tests/profile-names.sql', import.meta.url), 'utf8'), 'profile rename permissions, conflicts and journal preservation');
  executeSql(readFileSync(new URL('../supabase/tests/vaccinations.sql', import.meta.url), 'utf8'), 'vaccination validation, scope, revisions and sync');
  executeSql(readFileSync(new URL('../supabase/tests/care-events.sql', import.meta.url), 'utf8'), 'care events validation, scope, revisions and sync');
  executeSql(readFileSync(new URL('../supabase/tests/server-sessions.sql', import.meta.url), 'utf8'), 'server session ACL and lease assertions');
  console.log('PostgreSQL semantics tested. Supabase JWT/OAuth/PostgREST and concurrent sessions still require integration tests.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  if (containerId) {
    // Exact ID returned by this run, never a user-provided name or broad selector.
    const removed = run(['rm', '--force', containerId]);
    if (removed.status !== 0) {
      console.error('Could not clean up the disposable baby-tracker-test container. Check Docker Desktop.');
      process.exitCode = 1;
    } else console.log('Removed disposable container and temporary test data; repository files untouched.');
  }
}