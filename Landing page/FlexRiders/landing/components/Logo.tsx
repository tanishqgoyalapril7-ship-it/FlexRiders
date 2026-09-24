import Image from "next/image";
import markLight from "@/public/images/fr-mark-light.png";
import markDark from "@/public/images/fr-mark-dark.png";

type Props = {
  /** "light" = for dark backgrounds (white F). "dark" = for light backgrounds. */
  tone?: "light" | "dark";
  height?: number;
  wordmark?: boolean;
  className?: string;
  priority?: boolean;
};

export default function Logo({
  tone = "light",
  height = 22,
  wordmark = true,
  className,
  priority,
}: Props) {
  const src = tone === "light" ? markLight : markDark;
  const width = Math.round((height * src.width) / src.height);
  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: height * 0.42 }}
    >
      <Image
        src={src}
        alt={wordmark ? "" : "Flex Riders"}
        width={width}
        height={height}
        priority={priority}
        sizes={`${width * 2}px`}
      />
      {wordmark && (
        <span
          style={{
            fontSize: height * 0.82,
            fontWeight: 700,
            letterSpacing: "-0.03em",
            lineHeight: 1,
            whiteSpace: "nowrap",
            color: tone === "light" ? "#f5f5f7" : "var(--ink)",
          }}
        >
          Flex <span style={{ color: tone === "light" ? "#2e9bfa" : "#0068d8" }}>Riders</span>
        </span>
      )}
    </span>
  );
}
