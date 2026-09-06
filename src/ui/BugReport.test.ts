import { expect, it, vi } from 'vitest';
import type { LocalStore } from '../data/store';

const rpc = vi.fn();
vi.mock('../cloud/supabase', () => ({ authenticatedTransport: vi.fn(async () => ({ rpc })) }));
import { submitBugReport } from './BugReport';

it('sends only the report and technical context to the database RPC', async () => {
  rpc.mockResolvedValueOnce({ status: 'created' });
  const store = { db: { userId: 'account' } } as unknown as LocalStore;
  const signal = new AbortController().signal;
  await expect(submitBugReport(store, '  Không lưu được bình sữa  ', {
    userAgent: 'Test Browser 1.0', online: true, installed: true,
  }, signal)).resolves.toBe('created');
  expect(rpc).toHaveBeenCalledWith('report_app_bug', {
    p_description: 'Không lưu được bình sữa', p_user_agent: 'Test Browser 1.0', p_online: true, p_installed: true,
  }, signal);
});