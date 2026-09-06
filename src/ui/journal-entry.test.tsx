import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { EventBody } from '../domain/types';
import { JournalEntryForm } from './JournalEntryForm';
import { journalEntryDraft, journalEntryRecord, type QuickBody } from './journal-entry';

const timezone = 'Asia/Ho_Chi_Minh';
const now = Date.parse('2026-09-06T12:00:00Z');
const common = { started_at: '2026-09-05T15:00:00.000Z', ended_at: null, note: 'Ghi chú cũ', deleted: false };
const bottle: QuickBody = { ...common, type: 'bottle', payload: { amount_ml: 90, milk: 'formula' } };

describe('journal entry editing', () => {
  it('loads existing bottle details in the family timezone and updates every field', () => {
    const draft = journalEntryDraft(bottle, timezone);
    expect(draft).toMatchObject({ date: '2026-09-05', time: '22:00', amount: '90', milk: 'formula', note: 'Ghi chú cũ' });
    const body = journalEntryRecord('bottle', { ...draft, time: '21:30', amount: '120', milk: 'breast_milk', note: ' Đã sửa ' }, timezone, now);
    expect(body).toEqual({ ...common, started_at: '2026-09-05T14:30:00.000Z', note: 'Đã sửa', type: 'bottle', payload: { amount_ml: 120, milk: 'breast_milk' } });
  });

  it('updates diaper kind and completed sleep start/end times', () => {
    const diaper = journalEntryRecord('diaper', { ...journalEntryDraft(bottle, timezone), diaper: 'mixed' }, timezone, now);
    expect(diaper).toMatchObject({ type: 'diaper', payload: { kind: 'mixed' } });
    const sleep: QuickBody = { ...common, type: 'sleep', ended_at: '2026-09-05T23:00:00.000Z', payload: {} };
    const saved = journalEntryRecord('sleep', { ...journalEntryDraft(sleep, timezone), time: '21:00', endTime: '05:30' }, timezone, now);
    expect(saved).toMatchObject({ started_at: '2026-09-05T14:00:00.000Z', ended_at: '2026-09-05T22:30:00.000Z' });
  });

  it('preserves nursing segments while allowing side and boundary edits', () => {
    const breast = { ...common, type: 'breast', ended_at: '2026-09-05T15:20:00.000Z', payload: { segments: [
      { side: 'left', started_at: common.started_at, ended_at: '2026-09-05T15:10:00.000Z' },
      { side: 'right', started_at: '2026-09-05T15:10:00.000Z', ended_at: '2026-09-05T15:20:00.000Z' },
    ] } } satisfies EventBody as QuickBody;
    const draft = journalEntryDraft(breast, timezone);
    draft.segments[0].side = 'right'; draft.segments[0].endTime = '22:12';
    const saved = journalEntryRecord('breast', draft, timezone, now);
    expect(saved.type === 'breast' && saved.payload.segments).toEqual([
      { side: 'right', started_at: '2026-09-05T15:00:00.000Z', ended_at: '2026-09-05T15:12:00.000Z' },
      { side: 'right', started_at: '2026-09-05T15:12:00.000Z', ended_at: '2026-09-05T15:20:00.000Z' },
    ]);
  });

  it('renders editable details plus save and delete actions', () => {
    const html = renderToStaticMarkup(<JournalEntryForm body={bottle} timezone={timezone} saving={false} onSave={() => {}} onDelete={() => {}} />);
    expect(html).toContain('name="amount"'); expect(html).toContain('name="milk"');
    expect(html).toContain('name="date"'); expect(html).toContain('name="time"'); expect(html).toContain('name="note"');
    expect(html).toContain('Lưu thay đổi'); expect(html).toContain('Xóa ghi nhận');
  });
});