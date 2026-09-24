"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { getLenis } from "@/lib/scroll";
import { IconCheck, IconClose } from "./Icons";
import MagneticButton from "./MagneticButton";
import styles from "./Contact.module.css";

export type Intent = "start" | "talk" | "support";
type Role = "business" | "rider";

const ContactCtx = createContext<(intent?: Intent) => void>(() => {});
export const useContact = () => useContext(ContactCtx);

const copy: Record<Intent, { title: string; sub: string }> = {
  start: {
    title: "Get started with Flex Riders",
    sub: "Tell us a little about you and we'll help you get set up.",
  },
  talk: {
    title: "Talk to us",
    sub: "Questions about running riders on Flex Riders? We'd love to hear from you.",
  },
  support: {
    title: "Get support",
    sub: "Describe what you need help with and we'll get back to you.",
  },
};

type Status = "idle" | "sending" | "sent" | "error";

export function ContactProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [intent, setIntent] = useState<Intent>("start");
  const [role, setRole] = useState<Role>("business");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [firstName, setFirstName] = useState("");
  const [open, setOpenState] = useState(false);
  const titleId = useId();
  const descId = useId();

  const openDialog = useCallback((next: Intent = "start") => {
    setIntent(next);
    setRole("business");
    setStatus("idle");
    setError("");
    const d = dialogRef.current;
    if (d && !d.open) {
      d.showModal();
      getLenis()?.stop();
      setOpenState(true);
    }
  }, []);

  const close = useCallback(() => dialogRef.current?.close(), []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClose = () => {
      getLenis()?.start();
      setOpenState(false);
    };
    // Click on the backdrop (the dialog element itself) closes it.
    const onClick = (e: MouseEvent) => {
      if (e.target === d) d.close();
    };
    d.addEventListener("close", onClose);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("close", onClose);
      d.removeEventListener("click", onClick);
    };
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries());
    setStatus("sending");
    setError("");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, role, intent }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Something went wrong. Please try again.");
      setFirstName(String(data.name || "").trim().split(" ")[0]);
      setStatus("sent");
      form.reset();
    } catch (err) {
      setStatus("error");
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  const c = copy[intent];

  return (
    <ContactCtx.Provider value={openDialog}>
      {children}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <AnimatePresence>
          {open && (
            <motion.div
              className={styles.panel}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ type: "spring", stiffness: 320, damping: 30 }}
            >
              <button className={styles.close} onClick={close} aria-label="Close dialog">
                <IconClose />
              </button>

              {status === "sent" ? (
                <div className={styles.done} role="status">
                  <span className={styles.doneIcon}>
                    <IconCheck size={26} />
                  </span>
                  <h2 id={titleId} className={styles.title}>
                    {firstName ? `Thanks, ${firstName}.` : "Thank you."}
                  </h2>
                  <p id={descId} className={styles.sub}>
                    Your message is with the Flex Riders team. We&apos;ll be in touch soon.
                  </p>
                  <MagneticButton variant="ghost" onClick={close}>
                    Close
                  </MagneticButton>
                </div>
              ) : (
                <form onSubmit={onSubmit} noValidate={false}>
                  <h2 id={titleId} className={styles.title}>
                    {c.title}
                  </h2>
                  <p id={descId} className={styles.sub}>
                    {c.sub}
                  </p>

                  <fieldset className={styles.segment}>
                    <legend className="sr-only">I am</legend>
                    {(
                      [
                        ["business", "I manage riders"],
                        ["rider", "I'm a rider"],
                      ] as const
                    ).map(([value, label]) => (
                      <label key={value} className={role === value ? styles.segOn : undefined}>
                        <input
                          type="radio"
                          name="roleChoice"
                          value={value}
                          checked={role === value}
                          onChange={() => setRole(value)}
                        />
                        {label}
                      </label>
                    ))}
                  </fieldset>

                  <div className={styles.fields}>
                    <label className={styles.field}>
                      <span>Full name</span>
                      <input name="name" required autoComplete="name" maxLength={120} />
                    </label>
                    <label className={styles.field}>
                      <span>Email</span>
                      <input name="email" type="email" required autoComplete="email" maxLength={160} />
                    </label>
                    <label className={styles.field}>
                      <span>Phone {role === "business" && <em>(optional)</em>}</span>
                      <input
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        required={role === "rider"}
                        maxLength={24}
                      />
                    </label>
                    {role === "business" ? (
                      <label className={styles.field}>
                        <span>Company</span>
                        <input name="company" required autoComplete="organization" maxLength={160} />
                      </label>
                    ) : (
                      <label className={styles.field}>
                        <span>City</span>
                        <input name="city" required autoComplete="address-level2" maxLength={80} />
                      </label>
                    )}
                    <label className={`${styles.field} ${styles.full}`}>
                      <span>
                        Message <em>(optional)</em>
                      </span>
                      <textarea name="message" rows={3} maxLength={2000} />
                    </label>
                  </div>

                  <div className={styles.actions}>
                    <p className={styles.error} role="alert" aria-live="assertive">
                      {status === "error" ? error : ""}
                    </p>
                    <MagneticButton type="submit" arrow={status !== "sending"}>
                      {status === "sending" ? "Sending…" : "Send"}
                    </MagneticButton>
                  </div>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </dialog>
    </ContactCtx.Provider>
  );
}

/** Any button that opens the contact dialog. */
export function ContactButton({
  intent = "start",
  children,
  variant = "primary",
  size,
  arrow,
  className,
}: {
  intent?: Intent;
  children: ReactNode;
  variant?: "primary" | "ghost" | "link";
  size?: "md" | "sm";
  arrow?: boolean;
  className?: string;
}) {
  const open = useContact();
  return (
    <MagneticButton
      variant={variant}
      size={size}
      arrow={arrow}
      className={className}
      onClick={() => open(intent)}
    >
      {children}
    </MagneticButton>
  );
}
