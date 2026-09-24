import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

const base = (size = 24): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
  focusable: false,
});

export const IconArrowRight = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}>
    <path d="M5 12h13M13 6l6 6-6 6" />
  </svg>
);
export const IconChevronRight = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2} {...p}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);
export const IconCheck = ({ size = 16, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.4} {...p}>
    <path d="M5 12.5l4.2 4.2L19 7" />
  </svg>
);
export const IconClose = ({ size = 20, ...p }: P) => (
  <svg {...base(size)} strokeWidth={1.8} {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const IconUser = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-3.5 4.4-5 8-5s6.5 1.5 8 5" />
  </svg>
);
export const IconShieldCheck = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6L12 3z" />
    <path d="M8.8 12.2l2.2 2.2 4.2-4.4" />
  </svg>
);
export const IconBrand = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  </svg>
);
export const IconWallet = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M3 10h18M16 14.5h1.5" />
    <path d="M6 6l9-2.5a1.5 1.5 0 0 1 1.9 1.4V6" />
  </svg>
);
export const IconSearch = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);
export const IconDoc = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 12h6M9 16h6" />
  </svg>
);
export const IconBell = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);
export const IconChart = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 20V4M4 20h16" />
    <path d="M8 16v-4M12 16V8M16 16v-6" />
  </svg>
);
export const IconHistory = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3 4v4h4M12 8v4.5l3 2" />
  </svg>
);
export const IconLock = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="4.5" y="10.5" width="15" height="10" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </svg>
);
export const IconKey = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="8" cy="15" r="4" />
    <path d="M11 12l8-8M16 7l2.5 2.5M14 9l2 2" />
  </svg>
);
export const IconUsers = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="9" cy="8.5" r="3.5" />
    <path d="M2.5 19.5c1-3 3.5-4.5 6.5-4.5s5.5 1.5 6.5 4.5" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M18 15.2c1.7.7 2.9 2.1 3.5 4.3" />
  </svg>
);
export const IconApi = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M8 7l-5 5 5 5M16 7l5 5-5 5M13.5 5l-3 14" />
  </svg>
);
export const IconPin = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.4" />
  </svg>
);
export const IconBike = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="5.5" cy="16.5" r="3.5" />
    <circle cx="18.5" cy="16.5" r="3.5" />
    <path d="M5.5 16.5l4-7h5l4 7M9.5 9.5L8 6.5H5.5M14.5 9.5l1.5-3h2.5" />
  </svg>
);
export const IconBuilding = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 21V5l8-2v18M12 8h8v13M2.5 21h19M7 8h2M7 12h2M7 16h2M15.5 12h1.5M15.5 16h1.5" />
  </svg>
);
export const IconUpload = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 16V4M7 9l5-5 5 5M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
);
export const IconHome = ({ size = 24, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 10.5L12 4l8 6.5V20h-5v-6H9v6H4z" />
  </svg>
);

/** iOS-style status bar glyphs, drawn at 10px tall. */
export const StatusGlyphs = () => (
  <>
    <svg viewBox="0 0 18 11" aria-hidden="true">
      <rect x="0" y="7" width="3" height="4" rx="0.7" fill="currentColor" />
      <rect x="5" y="5" width="3" height="6" rx="0.7" fill="currentColor" />
      <rect x="10" y="2.5" width="3" height="8.5" rx="0.7" fill="currentColor" />
      <rect x="15" y="0" width="3" height="11" rx="0.7" fill="currentColor" />
    </svg>
    <svg viewBox="0 0 16 11" aria-hidden="true">
      <path
        d="M8 2.2c2.3 0 4.4.9 6 2.4l1.2-1.3A10.3 10.3 0 0 0 8 .4 10.3 10.3 0 0 0 .8 3.3L2 4.6a8.5 8.5 0 0 1 6-2.4zm0 3.3c1.4 0 2.6.5 3.6 1.4l1.2-1.3A7 7 0 0 0 8 3.7a7 7 0 0 0-4.8 1.9l1.2 1.3A5.2 5.2 0 0 1 8 5.5zM8 8.6l2.2-2.3a3.3 3.3 0 0 0-4.4 0z"
        fill="currentColor"
      />
    </svg>
    <svg viewBox="0 0 26 12" aria-hidden="true">
      <rect x="0.5" y="0.5" width="22" height="11" rx="3.2" stroke="currentColor" opacity="0.4" fill="none" />
      <rect x="2" y="2" width="17" height="8" rx="2" fill="currentColor" />
      <path d="M24 4v4c.8-.3 1.3-1.1 1.3-2S24.8 4.3 24 4z" fill="currentColor" opacity="0.5" />
    </svg>
  </>
);
