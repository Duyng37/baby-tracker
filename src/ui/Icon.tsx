import type { ReactNode } from 'react';

// The same quiet, rounded line icons as the wireframes; no icon font or network request.
const shapes = {
  today: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  journal: <><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M8 3v18M11 8h6M11 12h6M11 16h4M3 7h3M3 12h3M3 17h3" /></>,
  insights: <path d="M4 3v17h17M8 15v-4M13 15V6M18 15V9" />,
  family: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v3" /></>,
  breast: <path d="M4 9c-3 5 1 11 6 11h4c5 0 9-6 6-11M8 13c2 3 6 3 8 0M10 4a2 2 0 0 1 4 0v4h-4Z" />,
  bottle: <path d="M10 3h4v3h-4zM8 6h8v3H8zM8 9l-2 4v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6l-2-4M13 13h4M13 16h4" />,
  sleep: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /><path d="M17 3v4M15 5h4" /></>,
  diaper: <path d="M3 6h18l-2 12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3ZM3 10h18M5 12c4 0 5 4 5 8M19 12c-4 0-5 4-5 8" />,
  check: <path d="m5 12 4 4L19 6" />,
  cloud: <path d="M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 1 10h-2M9 16l3 3 4-5" />,
  offline: <path d="m3 3 18 18M8 18H6a4 4 0 0 1-2-7M9 5a7 7 0 0 1 9 3 5 5 0 0 1 3 8M12 12v6M10 16l2 2 2-2" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <><path d="m15 5 4 4M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15Z" /><path d="M13 20h7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7h.01" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2" /></>,
  swap: <path d="M4 7h15l-4-4M20 17H5l4 4M19 7l-4 4M5 17l4-4" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  logout: <path d="M9 4H4v16h5M10 12h11m-4-4 4 4-4 4" />,
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof shapes;
export function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  return <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>;
}