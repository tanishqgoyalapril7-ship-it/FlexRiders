import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import Providers from "@/components/Providers";
import { LEGAL } from "@/lib/legal";
import { founders, site } from "@/lib/site";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: site.title,
  description: site.description,
  applicationName: site.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: site.name,
    title: site.title,
    description: site.description,
    images: [{ url: "/images/og-image.jpg", width: 1200, height: 630, alt: "Flex Riders" }],
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: site.title,
    description: site.description,
    images: ["/images/og-image.jpg"],
  },
  keywords: [
    "bike advertising",
    "auto rickshaw advertising",
    "mobile advertising",
    "local brand promotion",
    "rider advertising Gurugram",
    "Flex Riders",
  ],
  robots: { index: true, follow: true },
  // Google Search Console: set NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION to the code from "HTML tag" verification.
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "light dark",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
        {/* Organization details for search engines (who runs Flex Riders). */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "Organization",
                  "@id": `${site.url}/#organization`,
                  name: site.name,
                  url: site.url,
                  logo: `${site.url}/icon.png`,
                  email: LEGAL.email,
                  description: site.description,
                  address: { "@type": "PostalAddress", addressLocality: "Gurugram", addressRegion: "Haryana", addressCountry: "IN" },
                  areaServed: { "@type": "City", name: "Gurugram" },
                  founder: founders.map((f) => ({ "@type": "Person", name: f.name, jobTitle: f.role })),
                },
                {
                  "@type": "WebSite",
                  "@id": `${site.url}/#website`,
                  url: site.url,
                  name: site.name,
                  inLanguage: "en-IN",
                  publisher: { "@id": `${site.url}/#organization` },
                },
              ],
            }),
          }}
        />
      </body>
    </html>
  );
}
