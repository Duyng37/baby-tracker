import { DataError, validateBody } from '../domain/events';
import type { Baby, EventBody, Scope } from '../domain/types';

export const maxBackupBytes = 10 * 1024 * 1024;
export const maxBackupEvents = 20_000;
export type BackupEvent = Scope & { id: string; body: EventBody };
export type Backup = {
  format: 'noi-backup'; version: 1; projectId: string; userId: string; exportedAt: string;
  families: { id: string; name: string; timezone: string }[];
  babies: Baby[]; events: BackupEvent[];
};
const invalid = () => new DataError('Tệp sao lưu không hợp lệ hoặc không thuộc phiên bản được hỗ trợ.');
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).length !== keys.length || Object.keys(row).some(key => !keys.includes(key))) throw invalid();
  return row;
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw invalid();
  return value.toLowerCase();
}
function text(value: unknown, max = 200): string {
  if (typeof value !== 'string' || !value.trim() || [...value].length > max) throw invalid();
  return value;
}
function array(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw invalid();
  return value;
}
function unique(values: { id: string }[]) {
  if (new Set(values.map(value => value.id)).size !== values.length) throw invalid();
}
export function parseBackup(source: string): Backup {
  if (source.length > maxBackupBytes || new TextEncoder().encode(source).byteLength > maxBackupBytes) {
    throw new DataError('Tệp sao lưu tối đa 10 MB.');
  }
  try {
    const row = object(JSON.parse(source), ['format', 'version', 'projectId', 'userId', 'exportedAt', 'families', 'babies', 'events']);
    if (row.format !== 'noi-backup' || row.version !== 1) throw invalid();
    const projectId = text(row.projectId);
    if (!/^[a-z0-9-]+\.supabase\.co$/.test(projectId)) throw invalid();
    const exportedAt = text(row.exportedAt, 40);
    if (!/^\d{4}-\d{2}-\d{2}T.*Z$/.test(exportedAt) || !Number.isFinite(Date.parse(exportedAt))) throw invalid();
    const families = array(row.families, 500).map(value => {
      const f = object(value, ['id', 'name', 'timezone']);
      const timezone = text(f.timezone, 100);
      new Intl.DateTimeFormat('vi', { timeZone: timezone }).format();
      return { id: id(f.id), name: text(f.name), timezone };
    });
    unique(families);
    const babies = array(row.babies, 2000).map(value => {
      const b = object(value, ['id', 'family_id', 'nickname', 'birth_date']);
      const family_id = id(b.family_id);
      if (!families.some(family => family.id === family_id)) throw invalid();
      const birth_date = b.birth_date === null ? null : text(b.birth_date, 10);
      if (birth_date !== null && (!/^\d{4}-\d{2}-\d{2}$/.test(birth_date)
        || new Date(birth_date).toISOString().slice(0, 10) !== birth_date)) throw invalid();
      return { id: id(b.id), family_id, nickname: text(b.nickname), birth_date };
    });
    unique(babies);
    const scopes = new Map(babies.map(baby => [baby.id, baby.family_id]));
    const events = array(row.events, maxBackupEvents).map(value => {
      const e = object(value, ['id', 'family_id', 'baby_id', 'body']);
      const family_id = id(e.family_id), baby_id = id(e.baby_id);
      if (scopes.get(baby_id) !== family_id) throw invalid();
      const body = object(e.body, ['type', 'started_at', 'ended_at', 'payload', 'note', 'deleted']) as unknown as EventBody;
      validateBody(body, Infinity); // Historical files remain inspectable despite a skewed device clock.
      return { id: id(e.id), family_id, baby_id, body };
    });
    unique(events);
    return { format: 'noi-backup', version: 1, projectId, userId: id(row.userId), exportedAt, families, babies, events };
  } catch { throw invalid(); } // Never display parser errors containing file content.
}