import { expect, it, vi } from 'vitest';
import {
  capturePendingInvitation, consumePendingInvitation, invitationLink, invitationTokenFromHash, pendingInvitationKey,
} from './invitation-link';

const token = 'b76cdf28e2e642759ff8462855819e76ee7714bd44b741d2b24a47ced8f82ee0';
function memory() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

it('creates an invite fragment without retaining query parameters', () => {
  expect(invitationLink(token, 'https://noi.ruvosoft.com/?auth=private#old'))
    .toBe(`https://noi.ruvosoft.com/#invite=${token}`);
});

it('accepts only the expected opaque invitation format', () => {
  expect(invitationTokenFromHash(`#invite=${token.toUpperCase()}`)).toBe(token);
  for (const hash of ['#content', '#invite=short', '#invite=<script>', `#other=${token}`]) {
    expect(invitationTokenFromHash(hash)).toBeNull();
  }
});

it('stores the token for the login redirect and removes it from the visible URL', () => {
  const storage = memory();
  const clean = vi.fn();
  expect(capturePendingInvitation(`https://noi.ruvosoft.com/?login#invite=${token}`, storage, clean)).toBe(token);
  expect(storage.values.get(pendingInvitationKey)).toBe(token);
  expect(clean).toHaveBeenCalledWith('/?login');
  expect(consumePendingInvitation(storage)).toBe(token);
  expect(storage.values.has(pendingInvitationKey)).toBe(false);
});

it('fails closed when temporary browser storage is unavailable', () => {
  const blocked = { getItem: () => null, removeItem: () => {}, setItem: () => { throw new Error('blocked'); } };
  const clean = vi.fn();
  expect(capturePendingInvitation(`https://noi.ruvosoft.com/#invite=${token}`, blocked, clean)).toBeNull();
  expect(clean).not.toHaveBeenCalled();
});