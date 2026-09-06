export const pendingInvitationKey = 'noi:pending-invitation';
const tokenPattern = /^[a-f0-9]{64}$/i;

export function invitationTokenFromHash(hash: string) {
  const value = new URLSearchParams(hash.replace(/^#/, '')).get('invite')?.trim() ?? '';
  return tokenPattern.test(value) ? value.toLowerCase() : null;
}

export function invitationLink(token: string, currentUrl: string) {
  const website = new URL(currentUrl);
  website.search = '';
  website.hash = new URLSearchParams({ invite: token }).toString();
  return website.href;
}

export function invitationShareText(token: string, currentUrl: string) {
  return `Chăm sóc bé cùng tôi trên Nôi:\n${invitationLink(token, currentUrl)}\n\nMở link để tham gia.\nMã dự phòng: ${token}`;
}

type InvitationStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function capturePendingInvitation(currentUrl: string, storage: InvitationStorage, cleanUrl: (path: string) => void) {
  const url = new URL(currentUrl);
  const token = invitationTokenFromHash(url.hash);
  if (!token) return null;
  try {
    storage.setItem(pendingInvitationKey, token);
    cleanUrl(`${url.pathname}${url.search}`);
    return token;
  } catch {
    return null;
  }
}

export function consumePendingInvitation(storage: InvitationStorage) {
  try {
    const token = storage.getItem(pendingInvitationKey);
    storage.removeItem(pendingInvitationKey);
    return token && tokenPattern.test(token) ? token.toLowerCase() : '';
  } catch {
    return '';
  }
}