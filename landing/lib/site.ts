export const site = {
  name: "Flex Riders",
  title: "Flex Riders — Promote Your Brand with Riders & Autos",
  description:
    "Flex Riders connects brands with riders, cycles, autos and three-wheelers for local campaigns. Riders discover campaigns near them, submit daily photos and track earnings; brands target an area and follow campaign activity.",
  // Set NEXT_PUBLIC_SITE_URL in production so Open Graph URLs resolve absolutely.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  // Admin dashboard (its login screen): flexriders.in/admin in production, the dashboard's dev server locally.
  adminUrl:
    process.env.NEXT_PUBLIC_ADMIN_URL ??
    (process.env.NODE_ENV === "production" ? "/admin" : "http://localhost:5180"),
  // Brand web portal (its own login): flexriders.in/brand in production, the dashboard's dev server locally.
  brandUrl:
    process.env.NEXT_PUBLIC_BRAND_URL ??
    (process.env.NODE_ENV === "production" ? "/brand" : "http://localhost:5180/brand"),
};

export type NavLink = { label: string; href: `#${string}` };

export const navLinks: NavLink[] = [
  { label: "Product", href: "#product" },
  { label: "For Brands", href: "#brands" },
  { label: "Pricing", href: "#plan" },
  { label: "For Riders", href: "#riders" },
  { label: "How It Works", href: "#how-it-works" },
];

export const footerProduct: NavLink[] = [
  ...navLinks,
  { label: "Trust & Operations", href: "#operations" },
  { label: "FAQ", href: "#faq" },
];
