import { site } from "@/lib/site";
import s from "./LiveStrip.module.css";

const items = [
  "FlexRiders is now LIVE on Google Play",
  "Riders: download the app and start earning",
  "Brands: launch campaigns from your phone",
];

/** Scrolling "we're live on Google Play" announcement above the top bar. */
export default function LiveStrip() {
  // The track holds the message twice so the loop is seamless.
  const run = (copy: number) => (
    <span className={s.run} aria-hidden={copy > 0 || undefined}>
      {items.map((t) => (
        <span key={t} className={s.item}>
          <span className={s.dot} />
          {t.includes("LIVE") ? (
            <>
              FlexRiders is now <b>LIVE</b> on Google Play
            </>
          ) : (
            t
          )}
        </span>
      ))}
      <span className={s.item}>
        <span className={s.dot} />
        <u>Download now →</u>
      </span>
    </span>
  );

  return (
    <a
      href={site.playStoreUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={s.strip}
      aria-label="FlexRiders is now live on Google Play. Download the app."
    >
      <span className={s.track}>
        {run(0)}
        {run(1)}
      </span>
      <span className={s.still} aria-hidden="true">
        🚀 FlexRiders is now <b>LIVE</b> on Google Play · <u>Download now →</u>
      </span>
    </a>
  );
}
