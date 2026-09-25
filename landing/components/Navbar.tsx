"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { navLinks } from "@/lib/site";
import { getLenis, scrollToHash } from "@/lib/scroll";
import { useContact } from "./Contact";
import Logo from "./Logo";
import MagneticButton from "./MagneticButton";
import styles from "./Navbar.module.css";

const ease = [0.22, 1, 0.36, 1] as const;

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string>("");
  const [tone, setTone] = useState<"dark" | "light">("dark");
  const openContact = useContact();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Glass on scroll, and match the tone of whichever section sits under the bar.
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setScrolled(window.scrollY > 12);
      const probe = 26;
      const sections = document.querySelectorAll<HTMLElement>("main > section, footer");
      for (const el of sections) {
        const r = el.getBoundingClientRect();
        if (r.top <= probe && r.bottom > probe) {
          setTone(el.classList.contains("theme-light") ? "light" : "dark");
          break;
        }
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  // Highlight the link for whichever section is crossing the upper-middle of the viewport.
  useEffect(() => {
    const ids = new Set(navLinks.map((l) => l.href.slice(1)));
    const els = document.querySelectorAll<HTMLElement>("main > section");
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(ids.has(e.target.id) ? e.target.id : "");
        });
      },
      { rootMargin: "-45% 0px -50% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // Mobile sheet: lock scroll, close on Escape, keep focus inside.
  useEffect(() => {
    if (!open) return;
    const lenis = getLenis();
    lenis?.stop();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
      if (e.key === "Tab" && sheetRef.current) {
        const f = sheetRef.current.querySelectorAll<HTMLElement>("a, button");
        const first = toggleRef.current!;
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      lenis?.start();
    };
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1061px)");
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    // Let the sheet start closing and scroll unlock before navigating.
    requestAnimationFrame(() => requestAnimationFrame(() => scrollToHash(href)));
  };

  return (
    <header
      className={styles.header}
      data-scrolled={scrolled || open}
      data-open={open}
      data-tone={open ? "dark" : tone}
    >
      <nav className={styles.nav} aria-label="Primary">
        <a
          href="#top"
          className={styles.brand}
          aria-label="Flex Riders — back to top"
          onClick={(e) => {
            e.preventDefault();
            go("#top");
          }}
        >
          <Logo height={20} tone={tone === "light" && !open ? "dark" : "light"} priority />
        </a>

        <ul className={styles.links}>
          {navLinks.map((l) => (
            <li key={l.href}>
              <a
                href={l.href}
                className={styles.link}
                aria-current={active === l.href.slice(1) ? "true" : undefined}
              >
                {l.label}
              </a>
            </li>
          ))}
        </ul>

        <div className={styles.right}>
          <MagneticButton size="sm" className={styles.cta} onClick={() => openContact("start")}>
            Get Started
          </MagneticButton>
          <button
            ref={toggleRef}
            className={styles.toggle}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            onClick={() => setOpen((o) => !o)}
          >
            <span />
            <span />
          </button>
        </div>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            id="mobile-menu"
            ref={sheetRef}
            className={styles.sheet}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.25 } }}
            transition={{ duration: 0.35, ease }}
          >
            <ul>
              {navLinks.map((l, i) => (
                <motion.li
                  key={l.href}
                  initial={{ opacity: 0, y: -8, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{ delay: 0.06 + i * 0.045, duration: 0.5, ease }}
                >
                  <a
                    href={l.href}
                    onClick={(e) => {
                      e.preventDefault();
                      go(l.href);
                    }}
                  >
                    {l.label}
                  </a>
                </motion.li>
              ))}
            </ul>
            <motion.div
              className={styles.sheetCta}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35, duration: 0.5, ease }}
            >
              <MagneticButton
                onClick={() => {
                  setOpen(false);
                  openContact("start");
                }}
                arrow
              >
                Get Started
              </MagneticButton>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
