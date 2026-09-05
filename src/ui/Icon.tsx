import type { ReactNode } from 'react';

// The same quiet, rounded line icons as the wireframes; no icon font or network request.
const shapes = {
  today: <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />,
  journal: <><rect x="5" y="3" width="15" height="18" rx="2" /><path d="M8 3v18M11 8h6M11 12h6M11 16h4M3 7h3M3 12h3M3 17h3" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4M17 3v4M3 11h18" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  insights: <path d="M4 3v17h17M8 15v-4M13 15V6M18 15V9" />,
  family: <><circle cx="9" cy="7" r="3" /><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M17 13a5 5 0 0 1 4 5v3" /></>,
  care: <path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 1 10 8 15 7-5 12-11 8-15ZM9 12h6M12 9v6" />,
  medication: <><path d="m9 3-6 6a5 5 0 0 0 7 7l6-6a5 5 0 0 0-7-7ZM6 6l7 7" /><circle cx="18" cy="18" r="3" /><path d="m16 16 4 4" /></>,
  meal: <path d="M3 12h18a9 9 0 0 1-18 0ZM5 22h14M8 3v5M12 2v6M16 3v5" />,
  growth: <><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M5 7h5M5 11h3M5 15h5M5 19h3M14 7v10m-2-2 2 2 2-2" /></>,
  activity: <><circle cx="15" cy="4" r="2" /><path d="m7 21 3-6-3-3 4-5 4 4h5M4 10l3-3h4M10 15h5l2 6" /></>,
  bath: <><path d="M3 12h18v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5ZM5 12V5a2 2 0 0 1 4 0M6 20v2M18 20v2" /><circle cx="15" cy="6" r="2" /></>,
  tummy_time: <><circle cx="6" cy="9" r="3" /><path d="M3 20h18M7 16l3-4h5l5 4M10 12l1 5h4" /></>,
  outdoor: <path d="m12 2 7 8h-4l6 7h-8v5h-2v-5H3l6-7H5Z" />,
  indoor: <path d="m3 10 9-7 9 7v11H3ZM8 21v-7h8v7M10 8h4" />,
  brushing_teeth: <><path d="M10 10v10a2 2 0 0 1-4 0V4h4M10 4h8v6h-8M13 4v6M16 4v6" /></>,
  breast: <path d="M4 9c-3 5 1 11 6 11h4c5 0 9-6 6-11M8 13c2 3 6 3 8 0M10 4a2 2 0 0 1 4 0v4h-4Z" />,
  bottle: <path d="M10 3h4v3h-4zM8 6h8v3H8zM8 9l-2 4v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6l-2-4M13 13h4M13 16h4" />,
  sleep: <><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" /><path d="M17 3v4M15 5h4" /></>,
  diaper: <path d="M3 6h18l-2 12a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3ZM3 10h18M5 12c4 0 5 4 5 8M19 12c-4 0-5 4-5 8" />,
  vaccination: <><path d="m14 4 6 6M17 3l4 4M18 6l-3 3M13 7l4 4-8 8H5v-4ZM5 19l-3 3M10 10l2 2M7 13l2 2" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  install: <><rect x="5" y="2" width="14" height="20" rx="3" /><path d="M12 6v9m-3-3 3 3 3-3M10 19h4" /></>,
  share: <><path d="M8 8H5v13h14V8h-3M12 15V2m-4 4 4-4 4 4" /></>,
  cloud: <path d="M7 18H6a4 4 0 0 1-1-8 7 7 0 0 1 13-2 5 5 0 0 1 1 10h-2M9 16l3 3 4-5" />,
  loading: <><circle cx="12" cy="12" r="9" opacity=".18" /><path d="M12 3a9 9 0 0 1 9 9" /></>,
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
  return <svg className={`icon ${name === 'loading' ? 'spinner ' : ''}${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{shapes[name]}</svg>;
}