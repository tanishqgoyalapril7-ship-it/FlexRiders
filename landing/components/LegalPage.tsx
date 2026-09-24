import Link from "next/link";
import type { ReactNode } from "react";
import Logo from "./Logo";

/** Minimal shell for policy pages. Content should be supplied by the Flex Riders team. */
export default function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main
      className="theme-light"
      style={{ minHeight: "100svh", padding: "32px var(--gutter) 96px" }}
    >
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <Link href="/" aria-label="Flex Riders home" style={{ display: "inline-flex" }}>
          <Logo tone="dark" height={22} />
        </Link>
        <h1 className="display" style={{ marginTop: 72 }}>
          {title}
        </h1>
        <div className="lead" style={{ marginTop: 24, display: "grid", gap: 16 }}>
          {children}
        </div>
        <p style={{ marginTop: 48 }}>
          <Link href="/" className="btn btn-ghost">
            Back to Flex Riders
          </Link>
        </p>
      </div>
    </main>
  );
}
