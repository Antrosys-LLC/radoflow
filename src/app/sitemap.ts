import type { MetadataRoute } from "next";

/**
 * What a search engine is invited to index: the public website, and nothing
 * else. Every other route is the staff portal behind a sign-in, and listing
 * those would advertise a login page to the world for no benefit.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env["NEXT_PUBLIC_SITE_URL"] ?? "https://www.radodyeing.com";

  return [
    {
      url: site,
      lastModified: new Date(),
      changeFrequency: "monthly",
      priority: 1,
    },
  ];
}
