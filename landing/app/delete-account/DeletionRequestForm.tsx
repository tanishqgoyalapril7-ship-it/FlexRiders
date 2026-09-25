"use client";

import { useState } from "react";

type State = { kind: "idle" } | { kind: "sending" } | { kind: "done"; message: string } | { kind: "error"; message: string };

export default function DeletionRequestForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length < 2) return setState({ kind: "error", message: "Enter the name on the account." });
    if (phone.replace(/\D/g, "").length < 10) return setState({ kind: "error", message: "Enter the 10-digit mobile number of the account." });
    setState({ kind: "sending" });
    try {
      const res = await fetch("/api/v1/public/account-deletion-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ full_name: name.trim(), mobile_number: phone.trim(), message: message.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data.detail === "string" ? data.detail : "Please check the details and try again.");
      setState({ kind: "done", message: data.message });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Something went wrong. Please try again." });
    }
  }

  if (state.kind === "done") {
    return (
      <div role="status" style={{ padding: 20, borderRadius: 14, background: "#ECFDF5", color: "#065F46", fontWeight: 600 }}>
        {state.message}
      </div>
    );
  }

  const input: React.CSSProperties = {
    width: "100%", padding: "12px 14px", borderRadius: 12, border: "1px solid #CBD5E1", fontSize: 16, background: "#fff", color: "#0F172A",
  };
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 14, marginTop: 8 }} noValidate>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Request deletion</h2>
      <label style={{ display: "grid", gap: 6, fontSize: 15 }}>
        Name on the account
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} required />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 15 }}>
        Mobile number on the account
        <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" autoComplete="tel" maxLength={20} required />
      </label>
      <label style={{ display: "grid", gap: 6, fontSize: 15 }}>
        Anything we should know (optional)
        <textarea style={{ ...input, minHeight: 90 }} value={message} onChange={(e) => setMessage(e.target.value)} maxLength={1000} />
      </label>
      {state.kind === "error" ? (
        <p role="alert" style={{ color: "#B91C1C", fontWeight: 600 }}>
          {state.message}
        </p>
      ) : null}
      <button type="submit" className="btn btn-primary" disabled={state.kind === "sending"} style={{ justifySelf: "start" }}>
        {state.kind === "sending" ? "Sending…" : "Send deletion request"}
      </button>
    </form>
  );
}
