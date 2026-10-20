import Image from "next/image";
import Link from "next/link";
import Footer from "./Footer";
import Logo from "./Logo";
import { IconArrowRight, IconCheck } from "./Icons";
import { PRICING, inr, minCampaign } from "@/lib/pricing";
import { SERVICES, SERVICE_STEPS, type Service } from "@/lib/services";
import { site } from "@/lib/site";
import s from "./ServicePage.module.css";

/** A search landing page for one service (bike / auto rickshaw advertising), server-rendered. */
export default function ServicePage({ service }: { service: Service }) {
  const p = PRICING[service.kind];
  const other = SERVICES.find((x) => x.slug !== service.slug);
  const url = `${site.url}/${service.slug}`;
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Service",
        name: service.h1,
        serviceType: service.kind === "bike" ? "Bike advertising" : "Auto rickshaw advertising",
        description: service.description,
        url,
        provider: { "@id": `${site.url}/#organization` },
        areaServed: { "@type": "City", name: "Gurugram" },
        offers: {
          "@type": "Offer",
          priceCurrency: "INR",
          price: p.rate,
          description: `${inr(p.rate)} per ${p.unit}${p.min > 1 ? `, minimum ${p.min} ${p.unit}s (${inr(minCampaign(service.kind))})` : ", no minimum"}`,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Flex Riders", item: site.url },
          { "@type": "ListItem", position: 2, name: service.breadcrumb, item: url },
        ],
      },
      {
        "@type": "FAQPage",
        mainEntity: service.faqs.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
      },
    ],
  };

  return (
    <>
      <header className={s.top}>
        <div className={`container ${s.topInner}`}>
          <Link href="/" aria-label="Flex Riders home">
            <Logo height={22} />
          </Link>
          <nav aria-label="Service page">
            <Link href="/#plan" className={s.topLink}>
              Pricing
            </Link>
            <Link href="/#enquiry" className="btn btn-primary btn-sm">
              Start a Campaign
            </Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className={`theme-dark ${s.hero}`} aria-labelledby="service-title">
          <div className={`container ${s.heroGrid}`}>
            <div>
              <ol className={s.crumbs} aria-label="Breadcrumb">
                <li>
                  <Link href="/">Home</Link>
                </li>
                <li aria-current="page">{service.breadcrumb}</li>
              </ol>
              <h1 id="service-title" className={s.title}>
                {service.h1}
              </h1>
              <p className={`lead ${s.lead}`}>{service.intro}</p>
              <div className={s.ctas}>
                <Link href="/#plan" className="btn btn-primary">
                  Estimate your campaign <IconArrowRight size={16} className="btn-arrow" />
                </Link>
                <Link href="/#enquiry" className="btn btn-ghost">
                  Send an enquiry
                </Link>
              </div>
            </div>
            <div className={s.media}>
              <Image src={service.image} alt={service.imageAlt} priority sizes="(max-width: 899px) 92vw, 560px" />
            </div>
          </div>
        </section>

        <section className={`section theme-light ${s.block}`} aria-labelledby="price-title">
          <div className={`container ${s.twoCol}`}>
            <div>
              <p className="eyebrow">Pricing</p>
              <h2 id="price-title" className={s.h2}>
                Simple, per-vehicle pricing
              </h2>
              <p className={s.text}>
                The cost depends only on how many {p.unit}s carry your brand. Our team confirms the final quote when your
                campaign is approved.
              </p>
            </div>
            <div className={s.price} data-kind={service.kind}>
              <p className={s.priceKicker}>{p.plural}</p>
              <p className={s.priceValue}>
                {inr(p.rate)} <span>per {p.unit}</span>
              </p>
              <p className={s.priceNote}>
                {p.min > 1 ? `Minimum ${p.min} ${p.unit}s · ${inr(minCampaign(service.kind))}` : "No minimum number of riders"}
              </p>
              <Link href="/#plan" className="btn btn-primary btn-sm">
                See your cost in the planner
              </Link>
            </div>
          </div>
        </section>

        <section className={`section theme-light theme-paper ${s.block}`} aria-labelledby="how-title">
          <div className="container">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className={s.h2}>
              From your area to your brand on the street
            </h2>
            <ol className={s.steps}>
              {SERVICE_STEPS.map((st, i) => (
                <li key={st.title}>
                  <span className={s.stepNum}>{String(i + 1).padStart(2, "0")}</span>
                  <h3>{st.title}</h3>
                  <p>{st.text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className={`section theme-light ${s.block}`} aria-labelledby="incl-title">
          <div className={`container ${s.twoCol}`}>
            <div>
              <p className="eyebrow">What's included</p>
              <h2 id="incl-title" className={s.h2}>
                Every campaign comes with
              </h2>
              <ul className={s.list}>
                {service.includes.map((t) => (
                  <li key={t}>
                    <IconCheck size={15} />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className={s.coverage}>
              <h3>{service.coverage.title}</h3>
              <p>{service.coverage.text}</p>
              <p className={s.illus}>{service.coverage.illustrative}</p>
            </div>
          </div>
        </section>

        <section className={`section theme-light theme-paper ${s.block}`} aria-labelledby="sfaq-title">
          <div className={`container ${s.faqWrap}`}>
            <h2 id="sfaq-title" className={s.h2}>
              Questions brands ask
            </h2>
            <div className={s.faq}>
              {service.faqs.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}</summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
            <p className={s.more}>
              More answers in the <Link href="/#faq">full FAQ</Link>.
            </p>
          </div>
        </section>

        <section className={`theme-dark ${s.cta}`} aria-labelledby="scta-title">
          <div className={`container ${s.ctaInner}`}>
            <h2 id="scta-title" className={s.h2}>
              Ready to put your brand on the road in Gurugram?
            </h2>
            <p className="lead">Plan your campaign, see the cost, and tell us where you want to be seen.</p>
            <div className={s.ctas}>
              <Link href="/#plan" className="btn btn-primary">
                Plan my campaign <IconArrowRight size={16} className="btn-arrow" />
              </Link>
              {other && (
                <Link href={`/${other.slug}`} className="btn btn-ghost">
                  {other.h1}
                </Link>
              )}
            </div>
          </div>
        </section>
      </main>
      <Footer linkBase="/" />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
    </>
  );
}
