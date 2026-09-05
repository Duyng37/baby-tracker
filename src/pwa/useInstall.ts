import { useSyncExternalStore } from 'react';
import { installSnapshot, subscribeInstall } from './install';

export function useInstall() {
  return useSyncExternalStore(subscribeInstall, installSnapshot, installSnapshot);
}