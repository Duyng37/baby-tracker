export type InstallPlatform = {
  kind: 'ios-safari' | 'ios-other' | 'android' | 'mac-safari' | 'desktop' | 'other';
  mobile: boolean;
  embedded: boolean;
};

// UA hints only select help text. Native installation always depends on a real browser event.
export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1);
  const android = /Android/i.test(userAgent);
  const safari = /Safari/i.test(userAgent) && !/Chrome|Chromium|CriOS|Edg|FxiOS|OPiOS|OPR|DuckDuckGo/i.test(userAgent);
  const embedded = /FBAN|FBAV|Instagram|Zalo|Line\/|; wv\)/i.test(userAgent);
  const kind = ios ? safari ? 'ios-safari' : 'ios-other'
    : android ? 'android' : safari && /Macintosh/i.test(userAgent) ? 'mac-safari'
    : /Windows|Macintosh|Linux|CrOS/i.test(userAgent) ? 'desktop' : 'other';
  return { kind, mobile: ios || android || /Mobile/i.test(userAgent), embedded };
}

export function installLabel(platform: InstallPlatform) {
  return platform.mobile ? 'Thêm vào màn hình chính' : platform.kind === 'other' ? 'Thêm Nôi vào thiết bị' : 'Cài Nôi trên máy tính';
}