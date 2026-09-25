import { DataError, validateBody } from '../domain/events';
import { dayKey } from '../domain/summary';
import type { ExpenseBody, ExpenseCategory, ExpenseMethod, ExpensePayer, LocalEvent } from '../domain/types';
import type { IconName } from './Icon';
import { recordingDateTime, recordingTime } from './recording-time';

export type StandardCategory = Exclude<ExpenseCategory, 'custom'>;
export const categoryLabels = { milk: 'Sữa', diaper: 'Bỉm', food: 'Ăn uống', health: 'Y tế', clothes: 'Quần áo',
  education: 'Học tập', toys: 'Đồ chơi', other: 'Khác' } satisfies Record<StandardCategory, string>;
export const categoryIcons = { milk: 'bottle', diaper: 'diaper', food: 'meal', health: 'medication', clothes: 'clothes',
  education: 'education', toys: 'toys', other: 'tag' } satisfies Record<StandardCategory, IconName>;
export const payerLabels = { father: 'Bố', mother: 'Mẹ', other: 'Người khác' } satisfies Record<ExpensePayer, string>;
export const methodLabels = { cash: 'Tiền mặt', transfer: 'Chuyển khoản', card: 'Thẻ', ewallet: 'Ví điện tử' } satisfies Record<ExpenseMethod, string>;
export const amountPresets = [50_000, 100_000, 200_000, 500_000];
export const maxAmount = 1_000_000_000;

export type ExpenseEvent = LocalEvent & { body: ExpenseBody };
export type ExpenseDraft = {
  date: string; time: string; amount: string; category: ExpenseCategory; custom: string;
  title: string; payer: ExpensePayer; method: ExpenseMethod; note: string;
};

const money = new Intl.NumberFormat('vi-VN');
/** "1.250.000 đ" — whole VND only. */
export function formatMoney(amount: number) { return `${money.format(amount)} đ`; }
/** Keep digits only and regroup thousands while typing. */
export function formatAmountInput(value: string) {
  const digits = value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 10);
  return digits ? money.format(Number(digits)) : '';
}
export function parseAmount(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}
export function normalizeCategoryName(value: string) { return value.trim().replace(/\s+/g, ' '); }

export function categoryKey(body: ExpenseBody) {
  return body.payload.category === 'custom' ? `custom:${body.payload.custom_category.toLocaleLowerCase('vi')}` : body.payload.category;
}
export function categoryName(body: ExpenseBody) {
  return body.payload.category === 'custom' ? body.payload.custom_category : categoryLabels[body.payload.category];
}
export function categoryIcon(body: ExpenseBody): IconName {
  return body.payload.category === 'custom' ? 'tag' : categoryIcons[body.payload.category];
}

export function isExpenseEvent(event: LocalEvent): event is ExpenseEvent {
  return !event.body.deleted && event.body.type === 'expense';
}
/** Newest first. */
export function expenseEvents(events: LocalEvent[]) {
  return events.filter(isExpenseEvent).sort((a, b) => Date.parse(b.body.started_at) - Date.parse(a.body.started_at));
}
/** Family-made categories, most recently used first, deduplicated case-insensitively. */
export function customCategories(events: LocalEvent[]) {
  const names = new Map<string, string>();
  for (const { body } of expenseEvents(events)) {
    if (body.payload.category !== 'custom') continue;
    const key = body.payload.custom_category.toLocaleLowerCase('vi');
    if (!names.has(key)) names.set(key, body.payload.custom_category);
  }
  return [...names.values()];
}

export function previousMonth(month: string) {
  const [year, value] = month.split('-').map(Number);
  return value === 1 ? `${year - 1}-12` : `${year}-${String(value - 1).padStart(2, '0')}`;
}
export function expenseMonth(event: ExpenseEvent, timezone: string) { return dayKey(Date.parse(event.body.started_at), timezone).slice(0, 7); }

export type CategoryTotal = { key: string; name: string; icon: IconName; total: number; count: number };
export function summarizeExpenses(events: ExpenseEvent[]) {
  const groups = new Map<string, CategoryTotal>();
  let total = 0;
  for (const { body } of events) {
    total += body.payload.amount;
    const key = categoryKey(body);
    const group = groups.get(key) ?? { key, name: categoryName(body), icon: categoryIcon(body), total: 0, count: 0 };
    group.total += body.payload.amount; group.count++;
    groups.set(key, group);
  }
  const categories = [...groups.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'vi'));
  return { total, count: events.length, categories };
}
/** Consecutive days in newest-first order, each with its own subtotal. */
export function groupByDay(events: ExpenseEvent[], timezone: string) {
  const days: { day: string; total: number; events: ExpenseEvent[] }[] = [];
  for (const event of events) {
    const day = dayKey(Date.parse(event.body.started_at), timezone);
    const last = days.at(-1);
    if (last?.day === day) { last.events.push(event); last.total += event.body.payload.amount; }
    else days.push({ day, total: event.body.payload.amount, events: [event] });
  }
  return days;
}

export function expenseDraft(timezone: string, body?: ExpenseBody, defaults: Partial<Pick<ExpenseDraft, 'payer' | 'method'>> = {}, now = Date.now()): ExpenseDraft {
  return { ...recordingDateTime(timezone, body ? Date.parse(body.started_at) : now),
    amount: body ? formatAmountInput(String(body.payload.amount)) : '',
    category: body?.payload.category ?? 'milk', custom: body?.payload.custom_category ?? '',
    title: body?.payload.title ?? '', payer: body?.payload.payer ?? defaults.payer ?? 'mother',
    method: body?.payload.method ?? defaults.method ?? 'cash', note: body?.note ?? '' };
}

export function expenseRecord(draft: ExpenseDraft, timezone: string, now = Date.now()): ExpenseBody {
  const amount = parseAmount(draft.amount);
  if (!amount) throw new DataError('Vui lòng nhập số tiền.');
  if (amount > maxAmount) throw new DataError('Số tiền tối đa là 1.000.000.000 đ.');
  const custom = normalizeCategoryName(draft.custom);
  if (draft.category === 'custom' && !custom) throw new DataError('Vui lòng nhập tên danh mục.');
  if (!draft.date || !draft.time) throw new DataError('Vui lòng nhập ngày và giờ.');
  const at = recordingTime(draft.date, draft.time, timezone, now);
  const body: ExpenseBody = { type: 'expense', started_at: new Date(at).toISOString(), ended_at: null, note: draft.note.trim(), deleted: false,
    payload: { amount, category: draft.category, custom_category: draft.category === 'custom' ? custom : '',
      title: draft.title.trim(), payer: draft.payer, method: draft.method } };
  validateBody(body, now);
  return body;
}
