import type { ApplyRequest, ApplyResult, ChangePage, Workspace } from '../domain/types';
import { LocalStore } from '../data/store';

export type CloudFailure = 'auth' | 'forbidden' | 'invalid' | 'retry';
export class CloudError extends Error {
  constructor(readonly kind: CloudFailure) {
    super({ auth: 'Cần đăng nhập lại; dữ liệu chưa gửi vẫn được giữ.', forbidden: 'Quyền truy cập đã thay đổi; dữ liệu chưa gửi được cách ly.',
      invalid: 'Cloud từ chối dữ liệu. Bản ghi được giữ lại để kiểm tra.', retry: 'Chưa kết nối được cloud. Dữ liệu trên máy vẫn được giữ.' }[kind]);
  }
}
export interface Transport {
  readonly userId: string;
  workspace(signal: AbortSignal): Promise<Workspace>;
  apply(request: ApplyRequest, signal: AbortSignal): Promise<ApplyResult>;
  pull(family: string, after: string, signal: AbortSignal): Promise<ChangePage>;
}

export async function synchronize(store: LocalStore, api: Transport, signal: AbortSignal) {
  if (api.userId !== store.db.userId) throw new CloudError('auth');
  signal.throwIfAborted();
  const workspace = await api.workspace(signal);
  signal.throwIfAborted();
  await store.saveWorkspace(workspace);
  const families = (await store.workspace()).families;
  async function pullAll() {
    for (const family of families) {
      try {
        let more = true;
        while (more) {
          signal.throwIfAborted();
          const after = await store.cursor(family.id);
          const page = await api.pull(family.id, after, signal);
          signal.throwIfAborted();
          const applied = await store.applyPage(family.id, after, page);
          more = !applied || page.has_more;
        }
      } catch (error) {
        if (error instanceof CloudError && error.kind === 'forbidden') await store.quarantine(family.id);
        throw error;
      }
    }
  }
  await pullAll();
  for (let count = 0; count < 100; count++) {
    signal.throwIfAborted();
    const op = await store.nextOperation();
    if (!op) break;
    try {
      const result = await api.apply(op.request!, signal);
      signal.throwIfAborted();
      await store.acknowledge(op, result);
    } catch (error) {
      if (error instanceof CloudError && error.kind === 'forbidden') await store.quarantine(op.family_id);
      if (error instanceof CloudError && error.kind === 'invalid') {
        await store.db.outbox.update(op.sequence!, { blocked: true });
      }
      throw error;
    }
  }
  await pullAll();
  signal.throwIfAborted();
  await store.db.state.put({ key: 'lastContact', value: Date.now() });
}

export function retryDelay(attempt: number, random = Math.random) {
  return Math.min(60_000, 1000 * 2 ** Math.min(attempt, 6)) * (0.75 + random() * 0.25);
}