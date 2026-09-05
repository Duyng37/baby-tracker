import { useEffect, useMemo } from 'react';
import { projectId } from './cloud/supabase';
import { TrackerDB } from './data/database';
import { LocalStore } from './data/store';
import { Tracker } from './ui/Tracker';

export default function Account({ userId, localOnly = false }: { userId: string; localOnly?: boolean }) {
  const store = useMemo(() => new LocalStore(new TrackerDB(projectId, userId)), [userId]);
  useEffect(() => {
    void store.db.open().catch(() => {}); // useStore renders a safe storage error.
    return () => store.db.close();
  }, [store]);
  return <Tracker store={store} localOnly={localOnly} />;
}