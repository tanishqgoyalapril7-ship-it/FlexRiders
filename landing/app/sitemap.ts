import type { MetadataRoute } from "next";
import { site } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/privacy", "/terms", "/delete-account"].map((p) => ({ url: `${site.url}${p}`, changeFrequency: "monthly" }));
}
