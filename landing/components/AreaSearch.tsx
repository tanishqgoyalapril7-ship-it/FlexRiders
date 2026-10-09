"use client";

import { useEffect, useId, useRef, useState } from "react";
import { IconPin, IconSearch } from "./Icons";
import type { Target } from "./RealCoverageMap";
import s from "./AreaSearch.module.css";

type Place = { label: string; description?: string; lat: number; lng: number };

/** Search a real place with the backend's area search (OpenStreetMap), the same one riders use. */
export default function AreaSearch({ onPick }: { onPick: (t: Target) => void }) {
  const id = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const picked = useRef(""); // the label just chosen; showing it in the box must not search again

  useEffect(() => {
    const term = q.trim();
    if (term.length < 3 || q === picked.current) {
      setResults([]);
      setState("idle");
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      setState("loading");
      try {
        const res = await fetch(`/api/v1/geo/search?q=${encodeURIComponent(term)}`, { signal: ctrl.signal });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setMessage(
            res.status === 429
              ? "Too many searches. Please wait a minute and try again."
              : "Area search isn't available right now. You can still tell us your area in the enquiry form.",
          );
          setState("error");
          return;
        }
        setResults(Array.isArray(json) ? json.slice(0, 6) : []);
        setState("done");
        setOpen(true);
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setMessage("We couldn't reach the area search. Check your connection and try again.");
          setState("error");
        }
      }
    }, 450);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  // Close the list on outside click.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  const pick = (p: Place) => {
    onPick({ label: p.label, lat: p.lat, lng: p.lng });
    picked.current = p.label;
    setQ(p.label);
    setOpen(false);
  };

  return (
    <div ref={boxRef} className={s.box}>
      <label htmlFor={id} className={s.label}>
        Where do you want to be seen?
      </label>
      <div className={s.field}>
        <IconSearch size={17} />
        <input
          id={id}
          type="search"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search an area, e.g. Sector 29 Gurugram"
          autoComplete="off"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={`${id}-list`}
        />
        {state === "loading" && <span className={s.spin} aria-label="Searching" />}
      </div>
      {open && q.trim().length >= 3 && (state === "done" || state === "error") && (
        <div className={s.pop}>
          {state === "error" ? (
            <p className={s.msg}>{message}</p>
          ) : results.length === 0 && state === "done" ? (
            <p className={s.msg}>No places found. Try adding the city name.</p>
          ) : (
            <ul id={`${id}-list`} role="listbox">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng},${r.label}`} role="option" aria-selected={false}>
                  <button type="button" onClick={() => pick(r)}>
                    <IconPin size={16} />
                    <span>
                      <b>{r.label}</b>
                      {r.description && <em>{r.description}</em>}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
