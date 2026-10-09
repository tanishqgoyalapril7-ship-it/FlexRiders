"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LEGAL } from "@/lib/legal";
import { PLAN_EVENT, PRICING, planSummary, type PlanDetail } from "@/lib/pricing";
import MagneticButton from "./MagneticButton";
import styles from "./Contact.module.css";

export type EnquiryRole = "business" | "rider" | "driver";

export const VEHICLE_OPTIONS: [string, string][] = [
  ["RIDER_BIKE", "Rider / Bike"],
  ["AUTO", "Auto"],
  ["THREE_WHEELER", "Three Wheeler"],
  ["MULTIPLE", "Multiple vehicles"],
];

const THANKS = "Thank you! Your enquiry has been submitted. Our team will contact you soon.";

const NETWORK_ERROR = `We couldn't reach Flex Riders. Check your internet connection and try again, or email us at ${LEGAL.email}.`;
const SERVER_ERROR = `Our server didn't respond properly. Please try again in a minute, or email us at ${LEGAL.email}.`;
const CHECK_DETAILS = "Some details don't look right. Please check your phone number and email, then try again.";

class EnquiryError extends Error {}

/** Sends a website enquiry to the FlexRiders backend, where it appears in the admin dashboard (Enquiries).
 *  Nothing submitted here is ever readable publicly. */
export default function EnquiryForm({
  role,
  intent,
  submitLabel = "Submit Enquiry",
  onDone,
}: {
  role: EnquiryRole;
  intent?: string;
  submitLabel?: string;
  onDone?: (firstName: string, message: string) => void;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [sentMessage, setSentMessage] = useState("");
  const business = role === "business";
  const formRef = useRef<HTMLFormElement>(null);
  const prefilled = useRef("");

  // A plan from the campaign planner pre-selects the vehicle and fills the message (both stay editable).
  useEffect(() => {
    if (!business) return;
    const onPlan = (e: Event) => {
      const plan = (e as CustomEvent<PlanDetail>).detail;
      const form = formRef.current;
      if (!form || !plan) return;
      const vehicle = form.elements.namedItem("vehicle_interest") as HTMLSelectElement | null;
      if (vehicle) vehicle.value = PRICING[plan.kind].enquiry;
      const message = form.elements.namedItem("message") as HTMLTextAreaElement | null;
      if (message && (!message.value.trim() || message.value === prefilled.current)) {
        message.value = prefilled.current = planSummary(plan);
      }
    };
    window.addEventListener(PLAN_EVENT, onPlan);
    return () => window.removeEventListener(PLAN_EVENT, onPlan);
  }, [business]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
    setStatus("sending");
    setError("");
    try {
      let res: Response;
      try {
        res = await fetch("/api/v1/public/enquiries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...data, kind: role, intent }),
        });
      } catch {
        throw new EnquiryError(NETWORK_ERROR);
      }
      const json = (await res.json().catch(() => ({}))) as { detail?: unknown; message?: string };
      if (!res.ok) {
        if (typeof json.detail === "string") throw new EnquiryError(json.detail);
        throw new EnquiryError(res.status >= 500 ? SERVER_ERROR : CHECK_DETAILS);
      }
      const message = json.message || THANKS;
      form.reset();
      if (onDone) onDone(String(data.name || "").trim().split(" ")[0], message);
      else {
        setSentMessage(message);
        setStatus("sent");
      }
      setStatus((s) => (onDone ? "idle" : s));
    } catch (err) {
      setStatus("error");
      setError(err instanceof EnquiryError ? err.message : SERVER_ERROR);
    }
  }

  if (status === "sent") {
    return (
      <p role="status" className={styles.sent}>
        {sentMessage}
      </p>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit}>
      {/* Honeypot: hidden from people; bots that fill it are ignored by the server. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className={styles.honeypot} aria-hidden="true" />
      <div className={styles.fields}>
        <label className={styles.field}>
          <span>Name</span>
          <input name="name" required autoComplete="name" maxLength={120} />
        </label>
        {business ? (
          <label className={styles.field}>
            <span>Company / Brand name</span>
            <input name="company_name" required autoComplete="organization" maxLength={160} />
          </label>
        ) : (
          <label className={styles.field}>
            <span>City</span>
            <input name="city" required autoComplete="address-level2" maxLength={80} />
          </label>
        )}
        <label className={styles.field}>
          <span>Phone number</span>
          <input name="phone" type="tel" required autoComplete="tel" inputMode="tel" maxLength={24} />
        </label>
        <label className={styles.field}>
          <span>
            Email <em>(optional)</em>
          </span>
          <input name="email" type="email" autoComplete="email" maxLength={160} />
        </label>
        {business ? (
          <>
            <label className={styles.field}>
              <span>Preferred vehicle type</span>
              <select name="vehicle_interest" defaultValue="">
                <option value="">Not sure yet</option>
                {VEHICLE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>
                Campaign duration <em>(optional)</em>
              </span>
              <input name="campaign_duration" maxLength={80} placeholder="e.g. 1 month" />
            </label>
            <label className={`${styles.field} ${styles.full}`}>
              <span>What would you like to promote?</span>
              <input name="campaign_requirement" required maxLength={1000} placeholder="e.g. New café launch in Gurugram, on autos" />
            </label>
          </>
        ) : null}
        <label className={`${styles.field} ${styles.full}`}>
          <span>
            Message / requirements <em>(optional)</em>
          </span>
          <textarea name="message" rows={3} maxLength={2000} />
        </label>
      </div>

      <div className={styles.actions}>
        <p className={styles.error} role="alert" aria-live="assertive">
          {status === "error" ? error : ""}
        </p>
        <MagneticButton type="submit" arrow={status !== "sending"}>
          {status === "sending" ? "Sending…" : submitLabel}
        </MagneticButton>
      </div>
    </form>
  );
}
