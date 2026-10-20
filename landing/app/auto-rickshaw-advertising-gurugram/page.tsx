import type { Metadata } from "next";
import ServicePage from "@/components/ServicePage";
import { serviceBySlug } from "@/lib/services";

const service = serviceBySlug("auto-rickshaw-advertising-gurugram")!;

export const metadata: Metadata = {
  title: { absolute: service.title },
  description: service.description,
  alternates: { canonical: "/auto-rickshaw-advertising-gurugram" },
  openGraph: {
    type: "website",
    url: "/auto-rickshaw-advertising-gurugram",
    title: service.title,
    description: service.description,
    images: [{ url: "/images/og-image.jpg", width: 1200, height: 630, alt: service.h1 }],
    locale: "en_IN",
  },
};

export default function Page() {
  return <ServicePage service={service} />;
}
