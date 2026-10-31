import { site } from "@/lib/site";
import s from "./GooglePlayBadge.module.css";

/** "Get it on Google Play" link to the Flex Riders app listing. */
export default function GooglePlayBadge({ className }: { className?: string }) {
  return (
    <a
      href={site.playStoreUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={className ? `${s.badge} ${className}` : s.badge}
      aria-label="Get the Flex Riders app on Google Play"
    >
      <svg width="22" height="24" viewBox="3 1.5 18 21" aria-hidden="true">
        <path fill="#00d7fe" d="M3.6 1.8c-.3.3-.5.8-.5 1.4v17.6c0 .6.2 1.1.5 1.4l.1.1 9.9-9.9v-.2L3.7 1.7z" />
        <path fill="#ffce00" d="M16.9 15.6l-3.3-3.3v-.2l3.3-3.3.1.1 3.9 2.2c1.1.6 1.1 1.7 0 2.3l-3.9 2.2z" />
        <path fill="#ff3a44" d="M17 15.5L13.6 12 3.6 22.1c.4.4 1 .4 1.7.1L17 15.5" />
        <path fill="#00f076" d="M17 8.5L5.3 1.9c-.7-.4-1.3-.3-1.7.1L13.6 12 17 8.5z" />
      </svg>
      <span>
        <small>GET IT ON</small>
        <b>Google Play</b>
      </span>
    </a>
  );
}
