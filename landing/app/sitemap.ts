import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date(); // the build date: the site is rebuilt on every deploy
  return [
    { url: site.url, lastModified, changeFrequency: "weekly", priority: 1 },
    ...["/privacy", "/terms", "/delete-account"].map((p) => ({
      url: `${site.url}${p}`,
      lastModified,
      changeFrequency: "monthly" as const,
      priority: 0.3,
    })),
  ];
}
