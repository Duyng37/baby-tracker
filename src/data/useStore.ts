import { useEffect, useState } from 'react';
import { liveQuery } from 'dexie';
import type { LocalStore } from './store';
import { emptyWorkspace, type LocalEvent, type Operation, type Workspace } from '../domain/types';

export type StoreView = { workspace: Workspace; events: LocalEvent[]; operations: Operation[]; lastContact: number | null; ready: boolean; error: boolean };
export function useStore(store: LocalStore): StoreView {
  const [view, setView] = useState<StoreView>({ workspace: emptyWorkspace(), events: [], operations: [], lastContact: null, ready: false, error: false });
  useEffect(() => {
    const subscription = liveQuery(() => store.db.transaction('r', store.db.state, store.db.events, store.db.outbox, async () => {
      const workspace = await store.workspace();
      const allowed = new Set(workspace.families.map(f => f.id));
      return { workspace, events: (await store.db.events.toArray()).filter(e => allowed.has(e.family_id)),
        operations: await store.db.outbox.toArray(), lastContact: (await store.db.state.get('lastContact'))?.value as number ?? null,
        ready: true, error: false };
    })).subscribe({ next: setView, error: () => setView(v => ({ ...v, error: true, ready: true })) });
    return () => subscription.unsubscribe();
  }, [store]);
  return view;
}