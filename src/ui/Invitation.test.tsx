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
const rpc = vi.fn();
const store = { db: { userId: 'owner' } } as unknown as LocalStore;
let tree: ReactNode;
function render() { mocks.cursor = 0; tree = Invitation({ store, familyId: 'family', onDone: vi.fn() }); }
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
  rpc.mockResolvedValue({ token: 'invite-token' });
  mocks.transport.mockResolvedValue({ rpc });
  writeText.mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { onLine: true, clipboard: { writeText } });
  vi.stubGlobal('window', { location: { href: 'https://noi.example/family?private=value#invite' } });
  render();
});
afterEach(() => vi.unstubAllGlobals());

it('copies a clean website link and the invitation code', async () => {
  await createInvitation();
  (button('Sao chép link và mã mời').props.onClick as () => void)();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith(
    'Chăm sóc bé cùng tôi trên Nôi:\nhttps://noi.example/family\n\nMã mời: invite-token'));
  render();
  expect(button('Đã sao chép')).toBeDefined();
  expect(elements().find(node => node.props.role === 'status')?.props.children).toBe('Đã sao chép link website và mã mời.');
});

it('reports when clipboard permission prevents copying', async () => {
  writeText.mockRejectedValue(new Error('denied'));
  await createInvitation();
  (button('Sao chép link và mã mời').props.onClick as () => void)();
  await vi.waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  render();
  expect(elements().find(node => node.props.role === 'alert')?.props.children).toContain('Không thể sao chép');
});