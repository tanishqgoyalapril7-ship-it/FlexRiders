/**
 * Social proof shown on the homepage (sections/Proof.tsx). Add ONLY real, verifiable entries:
 * figures from the admin dashboard and quotes people have agreed to have published.
 * While both lists are empty the section is not rendered at all.
 */

export type ProofStat = {
  /** e.g. "1,240" — as shown; keep it current. */
  value: string;
  /** e.g. "Campaign days verified" */
  label: string;
};

export type Testimonial = {
  quote: string;
  name: string;
  /** e.g. "Rider, Gurugram" or "Marketing lead, Brand name" */
  role: string;
};

export const proofStats: ProofStat[] = [];

export const testimonials: Testimonial[] = [];
