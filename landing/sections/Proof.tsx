import { proofStats, testimonials } from "@/lib/proof";
import s from "./Proof.module.css";

/** Real numbers and quotes from lib/proof.ts. Renders nothing until that file has entries. */
export default function Proof() {
  if (proofStats.length === 0 && testimonials.length === 0) return null;

  return (
    <section id="proof" className={`section theme-light ${s.proof}`} aria-labelledby="proof-title">
      <div className="container">
        <h2 id="proof-title" className="sr-only">
          Flex Riders in numbers
        </h2>
        {proofStats.length > 0 && (
          <dl className={s.stats}>
            {proofStats.map((st) => (
              <div key={st.label}>
                <dt>{st.label}</dt>
                <dd className="num">{st.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {testimonials.length > 0 && (
          <ul className={s.quotes}>
            {testimonials.map((t) => (
              <li key={t.name + t.quote}>
                <blockquote>&ldquo;{t.quote}&rdquo;</blockquote>
                <p>
                  <b>{t.name}</b> · {t.role}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
