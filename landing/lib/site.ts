export const site = {
  name: "Flex Riders",
  title: "FlexRiders: Bike & Auto Rickshaw Advertising in Gurugram",
  description:
    "FlexRiders (Flex Riders): bike and auto rickshaw advertising for local brands in Gurugram. Choose your area, see estimated reach and cost, and track photo-verified campaigns. Riders earn a daily rate.",
  // Set NEXT_PUBLIC_SITE_URL in production so Open Graph URLs resolve absolutely.
  url: process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
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

/** The people behind Flex Riders (shown in the footer and in the site's structured data). */
export const founders = [
  { name: "Adarsh Chandel", role: "Founder" },
  { name: "Tanishq Goyal", role: "Co-founder" },
];
