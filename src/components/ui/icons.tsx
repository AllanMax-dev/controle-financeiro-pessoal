import type { SVGProps } from "react";

const iconPaths = {
  account: (
    <>
      <path d="M4 8.5h16" />
      <path d="M6 8.5V18a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8.5" />
      <path d="M8 8.5V6.8A2.8 2.8 0 0 1 10.8 4h2.4A2.8 2.8 0 0 1 16 6.8v1.7" />
    </>
  ),
  add: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  archive: (
    <>
      <path d="M4 7h16" />
      <path d="M6 7v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7" />
      <path d="M9 11h6" />
      <path d="M5 4h14v3H5z" />
    </>
  ),
  bank: (
    <>
      <path d="m4 9 8-5 8 5" />
      <path d="M5 10h14" />
      <path d="M7 10v8" />
      <path d="M12 10v8" />
      <path d="M17 10v8" />
      <path d="M5 18h14" />
    </>
  ),
  card: (
    <>
      <rect x="4" y="6" width="16" height="12" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 15h3" />
    </>
  ),
  arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
  calendar: (
    <>
      <path d="M7 3v4" />
      <path d="M17 3v4" />
      <path d="M4.5 9h15" />
      <rect x="4.5" y="5" width="15" height="15" rx="2" />
    </>
  ),
  category: (
    <>
      <path d="M5 5h5v5H5z" />
      <path d="M14 5h5v5h-5z" />
      <path d="M5 14h5v5H5z" />
      <path d="M14 14h5v5h-5z" />
    </>
  ),
  close: (
    <>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </>
  ),
  dashboard: (
    <>
      <path d="M4 13h6V4H4z" />
      <path d="M14 20h6V4h-6z" />
      <path d="M4 20h6v-3H4z" />
    </>
  ),
  debt: (
    <>
      <path d="M6 4h12v16H6z" />
      <path d="M9 8h6" />
      <path d="M9 12h6" />
      <path d="M9 16h3" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v10" />
      <path d="m8 10 4 4 4-4" />
      <path d="M5 20h14" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z" />
      <path d="m14 7 3 3" />
    </>
  ),
  expense: (
    <>
      <path d="M12 5v14" />
      <path d="m17 14-5 5-5-5" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </>
  ),
  income: (
    <>
      <path d="M12 19V5" />
      <path d="m7 10 5-5 5 5" />
    </>
  ),
  goal: (
    <>
      <circle cx="12" cy="12" r="7" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 5v2" />
      <path d="M19 12h-2" />
      <path d="M12 17v2" />
      <path d="M7 12H5" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9.8 9.5a2.4 2.4 0 0 1 4.6.9c0 1.9-2.4 2.1-2.4 4" />
      <path d="M12 17.5h.01" />
    </>
  ),
  investment: (
    <>
      <path d="M4 18h16" />
      <path d="M7 15l4-4 3 3 5-7" />
      <path d="M15 7h4v4" />
    </>
  ),
  menu: (
    <>
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </>
  ),
  planning: (
    <>
      <path d="M5 19V5" />
      <path d="M5 19h14" />
      <path d="M8 15v-4" />
      <path d="M12 15V8" />
      <path d="M16 15v-6" />
    </>
  ),
  report: (
    <>
      <path d="M6 4h9l3 3v13H6z" />
      <path d="M14 4v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4" />
    </>
  ),
  transfer: (
    <>
      <path d="M7 7h12m-4-4 4 4-4 4" />
      <path d="M17 17H5m4 4-4-4 4-4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({
  name,
  ...props
}: SVGProps<SVGSVGElement> & { name: IconName }) {
  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="20"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width="20"
      {...props}
    >
      {iconPaths[name]}
    </svg>
  );
}
