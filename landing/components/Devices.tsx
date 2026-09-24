import type { CSSProperties, ReactNode } from "react";
import { IconLock, StatusGlyphs } from "./Icons";

type PhoneProps = {
  children: ReactNode;
  dark?: boolean;
  className?: string;
  style?: CSSProperties;
  label?: string;
};

/** A CSS-built phone. Content is authored on a 280×612 canvas; size with `--ps`. */
export function Phone({ children, dark, className, style, label }: PhoneProps) {
  return (
    <div
      className={["phone", className].filter(Boolean).join(" ")}
      style={style}
      role={label ? "img" : undefined}
      aria-label={label}
    >
      <div className="phone-screen" style={dark ? { background: "#0d0d0f" } : undefined}>
        <div className="phone-canvas" style={dark ? { color: "#f5f5f7" } : undefined}>
          <div className="phone-island" aria-hidden="true" />
          <div className="phone-status" aria-hidden="true">
            <span>9:41</span>
            <span className="phone-status-icons">
              <StatusGlyphs />
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

type BrowserProps = {
  children: ReactNode;
  title: string;
  className?: string;
  label?: string;
};

/** A minimal desktop browser window. Content should size itself in `--bx` units. */
export function Browser({ children, title, className, label }: BrowserProps) {
  return (
    <div className={["browser", className].filter(Boolean).join(" ")} role="img" aria-label={label}>
      <div className="browser-bar" aria-hidden="true">
        <div className="browser-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="browser-url">
          <IconLock size={11} strokeWidth={2} />
          {title}
        </div>
        <div style={{ width: "calc(var(--bx) * 45)" }} />
      </div>
      <div aria-hidden="true">{children}</div>
    </div>
  );
}

type Tone = "ok" | "wait" | "info" | "neutral";
const toneFor: Record<string, Tone> = {
  ACTIVE: "ok",
  PAID: "ok",
  APPROVED: "info",
  "BRAND ASSIGNED": "info",
  "PENDING REVIEW": "wait",
  PROCESSING: "wait",
  REGISTERED: "neutral",
};

export function StatusPill({
  status,
  tone,
  className,
  style,
}: {
  status: string;
  tone?: Tone;
  className?: string;
  style?: CSSProperties;
}) {
  const t = tone ?? toneFor[status] ?? "neutral";
  return (
    <span className={["pill", `is-${t}`, className].filter(Boolean).join(" ")} style={style}>
      {status}
    </span>
  );
}
