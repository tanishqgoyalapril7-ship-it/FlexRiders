import { NextResponse } from "next/server";

type Payload = Record<string, unknown>;

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

/**
 * Receives Get Started / Talk to Us enquiries.
 *
 * Delivery is modular: set CONTACT_WEBHOOK_URL to forward each enquiry as JSON
 * (e.g. to a CRM, Slack/Teams webhook, or email service). Without it, enquiries
 * are logged on the server so the flow works end-to-end in development.
 */
export async function POST(req: Request) {
  let body: Payload;
  try {
    body = (await req.json()) as Payload;
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const enquiry = {
    intent: str(body.intent, 16) || "start",
    role: str(body.role, 16) === "rider" ? "rider" : "business",
    name: str(body.name, 120),
    email: str(body.email, 160),
    phone: str(body.phone, 24),
    company: str(body.company, 160),
    city: str(body.city, 80),
    message: str(body.message, 2000),
    receivedAt: new Date().toISOString(),
  };

  if (!enquiry.name) {
    return NextResponse.json({ error: "Please enter your name." }, { status: 422 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enquiry.email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 422 });
  }

  const webhook = process.env.CONTACT_WEBHOOK_URL;
  if (webhook) {
    try {
      const res = await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(enquiry),
      });
      if (!res.ok) throw new Error(`Webhook responded ${res.status}`);
    } catch (err) {
      console.error("[contact] delivery failed", err);
      return NextResponse.json(
        { error: "We couldn't send your message just now. Please try again shortly." },
        { status: 502 },
      );
    }
  } else {
    console.info("[contact] new enquiry", enquiry);
  }

  return NextResponse.json({ ok: true });
}
