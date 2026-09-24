export const site = {
  name: "Flex Riders",
  title: "Flex Riders — Rider Management & Payment Platform",
  description:
    "Flex Riders helps organizations manage rider registration, approvals, brand assignments and payment tracking from one connected platform.",
  // Set NEXT_PUBLIC_SITE_URL in production so Open Graph URLs resolve absolutely.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  // Admin dashboard (its login screen). Set NEXT_PUBLIC_ADMIN_URL to the deployed dashboard address.
  adminUrl: process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:5180",
};

export type NavLink = { label: string; href: `#${string}` };

export const navLinks: NavLink[] = [
  { label: "Product", href: "#product" },
  { label: "For Riders", href: "#riders" },
  { label: "For Businesses", href: "#operations" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "Payments", href: "#payments" },
];

export const footerProduct: NavLink[] = [
  ...navLinks,
  { label: "Security", href: "#security" },
];
