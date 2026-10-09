import { PRICING, inr, minCampaign } from "@/lib/pricing";
import s from "./FAQ.module.css";

const faqs = [
  {
    q: "What is Flex Riders?",
    a: "A platform that connects brands with riders and vehicle owners (cycles, bikes, autos and three-wheelers) for local promotional campaigns. Riders find and complete campaigns in the Flex Riders app, brands request campaigns and follow their activity, and our operations team approves and verifies everything in between.",
  },
  {
    q: "How can a brand start a campaign?",
    a: "Send an enquiry from this page, or create a campaign request with a brand account in the Flex Riders app. You set the target area, riders needed, vehicle types, dates, daily hours and payout per day. Our team reviews every request before it's published to riders.",
  },
  {
    q: "How much does a campaign cost?",
    a: `Bike campaigns are ${inr(PRICING.bike.rate)} per rider, with no minimum. Auto campaigns are ${inr(PRICING.auto.rate)} per auto, with a minimum of ${PRICING.auto.min} autos (${inr(minCampaign("auto"))}). Use the estimator above to see your cost; our team confirms the final quote when your campaign is approved.`,
  },
  {
    q: "How are campaign areas determined?",
    a: "The brand sets a target area. The campaign reaches riders within a radius of that area and riders whose working areas match it. The radius starts small and expands step by step while slots are still open, up to the campaign's maximum. It stops expanding once the campaign is full.",
  },
  {
    q: "Which vehicles are supported?",
    a: "Cycle, bike / two-wheeler, auto and three-wheeler. Each campaign chooses which vehicle types can join.",
  },
  {
    q: "How are campaign activities verified?",
    a: "Riders submit three photos a day (Morning, Evening and Night), each within its time window. Every photo is reviewed; a day counts as complete when all three are approved. A photo that has already been uploaded can't be submitted again.",
  },
  {
    q: "How can I become a rider?",
    a: "Register in the Flex Riders app with your mobile number, vehicle details, documents, a selfie and the areas you work in. Our team reviews your profile, and once you're approved you can join campaigns. You can also leave your details on this page and we'll call you.",
  },
  {
    q: "How do riders get campaigns?",
    a: "The Campaigns tab lists open campaigns under Near You (around your current location), Opening Soon (starting within 48 hours) and My Areas (matching your working areas). Requesting to join holds a slot for you while our team approves the request.",
  },
  {
    q: "How do riders get paid?",
    a: "Each completed day earns the campaign's daily rate. Payouts are sent by the Flex Riders payments team to the rider's UPI ID, and the app shows each payout's status and transaction reference.",
  },
];

export default function FAQ() {
  return (
    <section id="faq" className="section theme-light" aria-labelledby="faq-title">
      <div className={`container ${s.grid}`}>
        <div className={s.head}>
          <p className="eyebrow">FAQ</p>
          <h2 id="faq-title" className="display">
            Questions, answered.
          </h2>
        </div>
        <div className={s.list}>
          {faqs.map(({ q, a }) => (
            <details key={q} className={s.item}>
              <summary>
                {q}
                <span className={s.plus} aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
