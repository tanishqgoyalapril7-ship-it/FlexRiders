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
  type ReactNode,
} from "react";
import { getLenis } from "@/lib/scroll";
import { IconCheck, IconClose } from "./Icons";
import MagneticButton from "./MagneticButton";
import EnquiryForm from "./EnquiryForm";
import styles from "./Contact.module.css";

export type Intent = "start" | "talk" | "support" | "advertise";
export type Role = "business" | "rider" | "driver";

const ContactCtx = createContext<(intent?: Intent, role?: Role) => void>(() => {});
export const useContact = () => useContext(ContactCtx);

const copy: Record<Intent, { title: string; sub: string }> = {
  start: {
    title: "Want to promote your brand?",
    sub: "Tell us about your campaign and our team will get in touch with you.",
  },
  talk: {
    title: "Talk to us",
    sub: "Questions about running riders on Flex Riders? We'd love to hear from you.",
  },
  advertise: {
    title: "Promote your brand with riders & autos",
    sub: "Tell us about your campaign and our team will get in touch with you.",
  },
  support: {
    title: "Get support",
    sub: "Describe what you need help with and we'll get back to you.",
  },
};

type Status = "idle" | "sent";

export function ContactProvider({ children }: { children: ReactNode }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [intent, setIntent] = useState<Intent>("start");
  const [role, setRole] = useState<Role>("business");
  const [status, setStatus] = useState<Status>("idle");
  const [firstName, setFirstName] = useState("");
  const [doneMessage, setDoneMessage] = useState("");
  const [open, setOpenState] = useState(false);
  const titleId = useId();
  const descId = useId();

  const openDialog = useCallback((next: Intent = "start", nextRole: Role = "business") => {
    setIntent(next);
    setRole(nextRole);
    setStatus("idle");
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
                    {doneMessage}
                  </p>
                  <MagneticButton variant="ghost" onClick={close}>
                    Close
                  </MagneticButton>
                </div>
              ) : (
                <div>
                  <h2 id={titleId} className={styles.title}>
                    {role === "business" ? c.title : "Join Flex Riders"}
                  </h2>
                  <p id={descId} className={styles.sub}>
                    {role === "business"
                      ? c.sub
                      : "Leave your details and our team will call you. Riders can also register directly in the FlexRiders app."}
                  </p>

                  <fieldset className={styles.segment}>
                    <legend className="sr-only">I am</legend>
                    {(
                      [
                        ["business", "Business / brand"],
                        ["rider", "Rider"],
                        ["driver", "Auto driver"],
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

                  <EnquiryForm
                    key={role}
                    role={role}
                    intent={intent}
                    submitLabel={role === "business" ? "Submit Enquiry" : "Send"}
                    onDone={(name, message) => {
                      setFirstName(name);
                      setDoneMessage(message);
                      setStatus("sent");
                    }}
                  />
                </div>
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
  role,
  children,
  variant = "primary",
  size,
  arrow,
  className,
}: {
  intent?: Intent;
  role?: Role;
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
      onClick={() => open(intent, role)}
    >
      {children}
    </MagneticButton>
  );
}
