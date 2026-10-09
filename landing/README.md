# Flex Riders — Marketing Landing Page

The public landing page for Flex Riders, built with Next.js 15 (App Router), Framer Motion and Lenis.

## Run

```bash
npm install
npm run dev        # http://localhost:3000
npm run build && npm start   # production
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | Public URL, used for canonical and Open Graph links. Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_BRAND_URL` | Where **Brand Login** (nav, For Brands, footer) goes: the brand web portal, which has its own login. Defaults to `/brand` in production and `http://localhost:5180/brand` locally. |

## Structure

```
app/            layout (SEO metadata, fonts), page, /privacy, /terms, /delete-account (enquiries go to the backend: /api/v1/public/enquiries), icons
components/     Navbar, Footer, Logo, MagneticButton, Reveal, SmoothScroll, Contact dialog,
                Devices (Phone, Browser, StatusPill), AppScreens (rider app mockups: Campaigns, Daily Activity, Earnings)
sections/       Homepage, in order: Hero, Snapshot, HowItWorks, RiderApp, ForBrands, Trust, Proof, FAQ, FinalCTA (enquiry form).
                Proof renders only when lib/proof.ts has real stats or testimonials. MobileActionBar (components/) is the phone-only sticky CTA.
                Older sections (Problem, Ecosystem, Riders, Operations, Payments, Security, …) are kept but not on the page.
lib/            site config and nav, demo data, scroll helpers, motion hooks
public/images/  optimised brand assets derived from ../Photos
```

## Notes

- **Product facts.** Copy describing the app (Near You / Opening Soon / My Areas, 48-hour Opening Soon window, radius expansion, Morning/Evening/Night photos, UPI payouts, vehicle types) mirrors the backend and rider app; update it if those rules change.
- **Demo data.** Everything shown inside the mockups (riders, brands, campaigns, amounts, IDs) comes from `lib/demo.ts` and is labelled on the page as demonstration data.
- **Features and claims.** The platform is described as managing and tracking payments. It is not described as moving money. The "On the roadmap" capabilities in the Scale section are clearly marked as not yet available.
- **Motion.** If the user has reduced motion turned on, the scroll-driven sections switch to static layouts and Lenis is disabled. Lenis is also skipped on touch devices.
- **`useScrollProgress`.** Scroll-linked values go through `lib/useScrollProgress.ts` instead of Framer's `useScroll` directly. With sticky targets, Framer's native ScrollTimeline acceleration drifts away from the real scroll position.
- **Privacy and Terms.** `/privacy` and `/terms` are placeholder pages that say the policies are being finalised. Replace them with the real policies.
