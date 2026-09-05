// Inspect build artifacts, NEVER environment files/values. Print pass/fail only.
import { readdirSync, readFileSync } from 'node:fs';

const root = new URL('../dist/', import.meta.url);
const paths = readdirSync(root, { recursive: true }).filter(path => /\.(js|html|map)$/.test(path));
const forbidden = /sb_secret_|SESSION_ENCRYPTION_KEY|SUPABASE_SECRET_KEY|bff_session_create|createDecipheriv|refresh_token|access_token/;
if (!paths.some(path => path.endsWith('.js'))) {
  console.error('FAIL: build artifacts missing. Run npm run build first.');
  process.exitCode = 1;
} else if (paths.some(path => forbidden.test(readFileSync(new URL(path.replaceAll('\\', '/'), root), 'utf8')))) {
  console.error('FAIL: server/auth-token markers found in client build. No matching values printed.');
  process.exitCode = 1;
} else console.log('PASS: no server-secret or auth-token implementation markers in client build.');