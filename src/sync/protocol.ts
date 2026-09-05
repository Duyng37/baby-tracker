import { DataError, decimal, serverBody, validateBody } from '../domain/events';
import type { ApplyResult, ChangePage, ServerEvent, Workspace } from '../domain/types';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DataError('Phản hồi cloud chưa hợp lệ.');
  return value as Record<string, unknown>;
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value) throw new DataError('Phản hồi cloud chưa hợp lệ.');
  return value;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new DataError('Phản hồi cloud chưa hợp lệ.');
  return value;
}
export function parseEvent(value: unknown): ServerEvent {
  const row = object(value);
  for (const field of ['id', 'family_id', 'baby_id', 'started_at']) text(row[field]);
  decimal(row.revision);
  if (row.revision === '0' || (row.deleted_at !== null && !Number.isFinite(Date.parse(text(row.deleted_at))))) throw new DataError();
  const event = row as unknown as ServerEvent;
  validateBody(serverBody(event), Infinity);
  return event;
}
export function parseWorkspace(value: unknown): Workspace {
  const row = object(value);
  return {
    families: array(row.families).map(value => {
      const f = object(value); decimal(f.sync_cursor);
      const timezone = text(f.timezone);
      new Intl.DateTimeFormat('vi', { timeZone: timezone }).format();
      return { id: text(f.id), name: text(f.name), timezone, sync_cursor: f.sync_cursor };
    }),
    babies: array(row.babies).map(value => {
      const b = object(value);
      return { id: text(b.id), family_id: text(b.family_id), nickname: text(b.nickname), birth_date: b.birth_date === null ? null : text(b.birth_date) };
    }),
    memberships: array(row.memberships).map(value => {
      const m = object(value);
      if (m.role !== 'owner' && m.role !== 'caregiver') throw new DataError();
      return { family_id: text(m.family_id), user_id: text(m.user_id), role: m.role };
    }),
  };
}
export function parseResult(value: unknown): ApplyResult {
  const row = object(value);
  const operation_id = text(row.operation_id);
  if (row.status === 'accepted') {
    decimal(row.cursor);
    return { operation_id, status: 'accepted', cursor: row.cursor, event: parseEvent(row.event) };
  }
  if (row.status !== 'conflict' || !['revision', 'active_timer'].includes(text(row.reason))) throw new DataError();
  return { operation_id, status: 'conflict', reason: row.reason as 'revision' | 'active_timer',
    event: row.event === null ? null : parseEvent(row.event),
    ...(row.reason === 'active_timer' ? { active_event: parseEvent(row.active_event) } : {}) };
}
export function parsePage(value: unknown): ChangePage {
  const row = object(value); decimal(row.next_cursor);
  if (typeof row.has_more !== 'boolean') throw new DataError();
  return { next_cursor: row.next_cursor, has_more: row.has_more, changes: array(row.changes).map(value => {
    const change = object(value); decimal(change.cursor);
    return { cursor: change.cursor, event: parseEvent(change.event) };
  }) };
}