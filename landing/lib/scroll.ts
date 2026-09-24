import type Lenis from "lenis";

let lenis: Lenis | null = null;

export const setLenis = (instance: Lenis | null) => {
  lenis = instance;
};

export const getLenis = () => lenis;

const NAV_OFFSET = -52;

/** Smoothly scroll to an in-page anchor, falling back to native scrolling. */
export function scrollToHash(hash: string, opts: { offset?: number } = {}) {
  const id = hash.replace(/^#/, "");
  const el = id === "top" ? document.body : document.getElementById(id);
  if (!el) return;
  const offset = opts.offset ?? (id === "top" ? 0 : NAV_OFFSET);

  if (lenis && id === "top") {
    lenis.scrollTo(0, { duration: 1.2 });
  } else if (lenis) {
    // Lenis already honours the CSS scroll-padding-top (nav height) for elements.
    lenis.scrollTo(el, { offset: offset - NAV_OFFSET, duration: 1.2 });
  } else {
    const y = el.getBoundingClientRect().top + window.scrollY + offset;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: y, behavior: reduce ? "auto" : "smooth" });
  }
  history.replaceState(null, "", id === "top" ? location.pathname : `#${id}`);

  // Move focus to the target for keyboard and screen-reader users.
  if (id !== "top") {
    if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
    (el as HTMLElement).focus({ preventScroll: true });
  }
}

/** Scroll so that a given progress (0–1) through a tall sticky section is reached. */
export function scrollToProgress(el: HTMLElement, progress: number) {
  const rect = el.getBoundingClientRect();
  const start = rect.top + window.scrollY;
  const distance = el.offsetHeight - window.innerHeight;
  const y = start + distance * progress;
  if (lenis) lenis.scrollTo(y, { duration: 1 });
  else window.scrollTo({ top: y, behavior: "smooth" });
}
