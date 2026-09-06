import { Children, isValidElement, type ReactElement, type ReactNode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';

const mocks = vi.hoisted(() => ({ slots: [] as unknown[], cursor: 0, transport: vi.fn() }));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const index = mocks.cursor++;
    if (!(index in mocks.slots)) mocks.slots[index] = typeof initial === 'function' ? initial() : initial;
    return [mocks.slots[index], (next: unknown) => {
      mocks.slots[index] = typeof next === 'function' ? next(mocks.slots[index]) : next;
    }];
  },
  useRef: (initial: unknown) => {
    const index = mocks.cursor++;
    if (!(index in mocks.slots)) mocks.slots[index] = { current: initial };
    return mocks.slots[index];
  },
  useEffect: vi.fn(),
}));
vi.mock('../cloud/supabase', () => ({ authenticatedTransport: mocks.transport }));
import { Invitation } from './Invitation';

const writeText = vi.fn();
const share = vi.fn();
const rpc = vi.fn();
const store = { db: { userId: 'owner' } } as unknown as LocalStore;
let tree: ReactNode;
let familyId: string | undefined;
let initialToken: string;
function render() { mocks.cursor = 0; tree = Invitation({ store, familyId, initialToken, onDone: vi.fn() }); }
function elements(node: ReactNode = tree): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(node).flatMap(child => isValidElement<Record<string, unknown>>(child)
    ? [child, ...elements((child.props.children as ReactNode) ?? null)] : []);
}
function button(label: string) {
  return elements().find(node => node.type === 'button' && Children.toArray(node.props.children as ReactNode).includes(label))!;
}
async function createInvitation() {
  await (button('Tạo mã mời').props.onClick as () => Promise<void>)();
  render();
}

beforeEach(() => {
  mocks.slots = []; vi.clearAllMocks();
  familyId = 'family'; initialToken = '';
  rpc.mockResolvedValue({ token: 'invite-token' });
  mocks.transport.mockResolvedValue({ rpc });
  writeText.mockResolvedValue(undefined); share.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { onLine: true, clipboard: { writeText }, share });
  vi.stubGlobal('window', { location: { href: 'https://noi.example/family?private=value#invite' } });
  render();
});
afterEach(() => vi.unstubAllGlobals());

it('copies a clean website link and the invitation code', async () => {
  await createInvitation();
  (button('Sao chép link mời').props.onClick as () => void)();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(
    'Chăm sóc bé cùng tôi trên Nôi:\nhttps://noi.example/family#invite=invite-token\n\nMở link để tham gia.\nMã dự phòng: invite-token'));
  render();
  expect(button('Đã sao chép')).toBeDefined();
  expect(elements().find(node => node.props.role === 'status')?.props.children).toBe('Đã sao chép link tham gia và mã dự phòng.');
});

it('reports when clipboard permission prevents copying', async () => {
  writeText.mockRejectedValue(new Error('denied'));
  await createInvitation();
  (button('Sao chép link mời').props.onClick as () => void)();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  render();
  expect(elements().find(node => node.props.role === 'alert')?.props.children).toContain('Không thể sao chép');
});

it('opens the native mobile share sheet with the one-tap invitation link', async () => {
  await createInvitation();
  (button('Chia sẻ lời mời').props.onClick as () => void)();
  await vi.waitFor(() => expect(share).toHaveBeenCalledWith({
    title: 'Lời mời chăm bé trên Nôi',
    text: 'Chăm sóc bé cùng tôi trên Nôi:\nhttps://noi.example/family#invite=invite-token\n\nMở link để tham gia.\nMã dự phòng: invite-token',
  }));
});

it('prefills an invitation received from a link and asks for confirmation', () => {
  mocks.slots = []; familyId = undefined; initialToken = 'received-token'; render();
  expect(elements().find(node => node.type === 'input')?.props.value).toBe('received-token');
  expect(button('Tham gia gia đình')).toBeDefined();
  expect(elements().find(node => node.props.role === 'status')?.props.children).toContain('được điền từ liên kết');
});