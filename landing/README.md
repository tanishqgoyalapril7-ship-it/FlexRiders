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
| `NEXT_PUBLIC_ADMIN_URL` | Where the footer's **Admin Login** button goes: the Flex Riders admin dashboard, which opens on its login screen. Defaults to `/admin` in production and `http://localhost:5180` (the dashboard's dev server) locally. |
| `CONTACT_WEBHOOK_URL` | Optional. Each enquiry includes a `role` (`business`, `rider` or `driver`) and an `intent` (`start`, `talk`, `support` or `advertise`). Each "Get Started" or "Talk to Us" enquiry is POSTed here as JSON (for a CRM, email service or chat webhook). If it isn't set, enquiries are only logged on the server. |

## Structure

```
app/            layout (SEO metadata, fonts), page, /api/contact, /privacy, /terms, icons
components/     Navbar, Footer, Logo, MagneticButton, Reveal, SmoothScroll, Contact dialog,
                Devices (Phone, Browser, StatusPill), RiderScreens (rider app mockup screens)
sections/       Hero, Problem, Ecosystem, Riders, Interlude, Operations, Approvals, Brands,
                Advertising (riders as promoters, auto-rickshaw ads, driver sign-up), Payments, Profile, Scale, Security, HowItWorks, FinalCTA
lib/            site config and nav, demo data, scroll helpers, motion hooks
public/images/  optimised brand assets derived from ../Photos
```

## Notes

- **Demo data.** Everything shown inside the mockups (riders, brands, amounts, IDs) comes from `lib/demo.ts` and is labelled on the page as demonstration data.
- **Features and claims.** The platform is described as managing and tracking payments. It is not described as moving money. The "On the roadmap" capabilities in the Scale section are clearly marked as not yet available.
- **Motion.** If the user has reduced motion turned on, the scroll-driven sections switch to static layouts and Lenis is disabled. Lenis is also skipped on touch devices.
- **`useScrollProgress`.** Scroll-linked values go through `lib/useScrollProgress.ts` instead of Framer's `useScroll` directly. With sticky targets, Framer's native ScrollTimeline acceleration drifts away from the real scroll position.
- **Privacy and Terms.** `/privacy` and `/terms` are placeholder pages that say the policies are being finalised. Replace them with the real policies.
