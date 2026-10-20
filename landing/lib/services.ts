import type { StaticImageData } from "next/image";
import ridersCover from "@/public/images/riders-cover-900.webp";
import autoAd from "@/public/images/auto-advertising.webp";
import type { VehicleKind } from "./pricing";

/** Service pages for search ("bike advertising Gurugram", …). Only real product facts, as on the homepage. */
export type ServiceFaq = { q: string; a: string };
export type Service = {
  slug: string;
  kind: VehicleKind;
  /** <title> and Google result title */
  title: string;
  description: string;
  h1: string;
  intro: string;
  image: StaticImageData;
  imageAlt: string;
  breadcrumb: string;
  includes: string[];
  coverage: { title: string; text: string; illustrative: string };
  faqs: ServiceFaq[];
};

const commonSteps = [
  { title: "Tell us your area", text: "Pick the city area where you want your brand to be seen and how far the campaign may reach." },
  { title: "Choose your campaign size", text: "Decide how many vehicles carry your brand and for how many days. See the cost before you enquire." },
  { title: "We review and launch", text: "Our team approves the campaign, then verified riders near your area join it." },
  { title: "Follow it every day", text: "Morning, evening and night photos from every rider, reviewed by our team, in your brand app or web portal." },
];
export const SERVICE_STEPS = commonSteps;

export const SERVICES: Service[] = [
  {
    slug: "bike-advertising-gurugram",
    kind: "bike",
    title: "Bike Advertising in Gurugram | FlexRiders",
    description:
      "Put your brand on bike riders moving through Gurugram's neighbourhoods and markets. Choose your area and campaign size, see the cost upfront, and track photo-verified campaign days.",
    h1: "Bike advertising in Gurugram",
    intro:
      "Local brands use Flex Riders to put their brand on verified bike riders who move through the streets, lanes and markets of the areas they choose. You decide where and for how long; every campaign day is backed by photos.",
    image: ridersCover,
    imageAlt: "Bike riders in branded campaign T-shirts with their bikes",
    breadcrumb: "Bike advertising in Gurugram",
    includes: [
      "Verified bike riders: documents and a selfie are checked before they can join",
      "Riders in your campaign T-shirts where your campaign uses brand gear",
      "Your target area, with a starting radius that grows while slots stay open",
      "Morning, evening and night photos every campaign day, each reviewed by our team",
      "Campaign progress, riders and approved photos in the brand app or web portal",
    ],
    coverage: {
      title: "Street-level reach, neighbourhood by neighbourhood",
      text: "Bike riders travel the inner lanes, residential sectors and market streets that larger vehicles rarely cover, so your brand is seen close to where customers live and shop.",
      illustrative:
        "Illustrative: 1 rider ≈ 20 potential home visits a day, so 10 riders ≈ 200 a day and ≈ 6,000 over 30 days. Actual visibility varies; Flex Riders does not guarantee impressions or reach.",
    },
    faqs: [
      {
        q: "How much does bike advertising cost?",
        a: "₹1,000 per bike rider, with no minimum number of riders. Use the campaign planner on our homepage to see your estimated cost; our team confirms the final quote when your campaign is approved.",
      },
      {
        q: "Which areas of Gurugram can I target?",
        a: "Any area you choose. You set a target area and a radius; riders nearest to it are offered the campaign first, and the radius grows step by step while slots are still open.",
      },
      {
        q: "How do I know riders actually carried my brand?",
        a: "Each rider submits three photos every campaign day (Morning, Evening and Night). Our team reviews every photo, and you can see the approved ones in the brand app or web portal.",
      },
    ],
  },
  {
    slug: "auto-rickshaw-advertising-gurugram",
    kind: "auto",
    title: "Auto Rickshaw Advertising in Gurugram | FlexRiders",
    description:
      "Rear-panel advertising on auto rickshaws across Gurugram's main roads, markets and traffic signals. Choose your area and number of autos, see the cost upfront, and track photo-verified campaign days.",
    h1: "Auto rickshaw advertising in Gurugram",
    intro:
      "Flex Riders puts your brand on auto rickshaws that spend the day on Gurugram's busiest roads, at traffic signals and around markets, seen by passengers, pedestrians and nearby traffic. You choose the area and the number of autos; every campaign day is backed by photos.",
    image: autoAd,
    imageAlt: "Auto rickshaw with a branded rear advertising panel",
    breadcrumb: "Auto rickshaw advertising in Gurugram",
    includes: [
      "Rear-panel branding on every auto in your campaign",
      "Verified auto drivers: documents and a selfie are checked before they can join",
      "Your target area, with a starting radius that grows while slots stay open",
      "Morning, evening and night photos every campaign day, each reviewed by our team",
      "Campaign progress, drivers and approved photos in the brand app or web portal",
    ],
    coverage: {
      title: "High-visibility reach on main roads",
      text: "Autos spend long stretches in traffic and at signals and stops, giving your brand repeated exposure to passengers, pedestrians and the vehicles around them.",
      illustrative:
        "Illustrative: a 30-minute passenger journey ≈ 20 minutes of brand exposure, plus around 90 seconds at each traffic signal. Actual visibility varies; Flex Riders does not guarantee impressions or reach.",
    },
    faqs: [
      {
        q: "How much does auto rickshaw advertising cost?",
        a: "₹1,200 per auto, with a minimum campaign of 10 autos (₹12,000). Use the campaign planner on our homepage to see your estimated cost; our team confirms the final quote when your campaign is approved.",
      },
      {
        q: "Who sees an auto rickshaw advertisement?",
        a: "Passengers inside the auto, pedestrians, and riders and drivers around it, especially while the auto waits in traffic and at signals.",
      },
      {
        q: "How do I know the autos carried my brand?",
        a: "Each driver submits three photos every campaign day (Morning, Evening and Night). Our team reviews every photo, and you can see the approved ones in the brand app or web portal.",
      },
    ],
  },
];

export const serviceBySlug = (slug: string) => SERVICES.find((s) => s.slug === slug);
