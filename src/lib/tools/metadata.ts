import type { Metadata } from "next";
import { SITE_URL } from "@/lib/site-config";
import type { ToolContent } from "./content";

/**
 * The `<head>` for a tool route.
 *
 * Structure only — every word comes from the page's own content file. What is
 * shared is the *shape*: a self-referential absolute canonical, and Open Graph
 * fields that repeat the same hand-written title and description rather than
 * inventing a second pair nobody proof-reads.
 *
 * The canonical is absolute and prefix-free because `localePrefix: "as-needed"`
 * serves English at the bare path. It is the URL that has to stay stable when a
 * second locale arrives, so it is built from the slug rather than from whatever
 * path the request happened to arrive on.
 */
export function toolMetadata(content: ToolContent): Metadata {
  const url = `${SITE_URL}/${content.slug}`;
  return {
    title: content.meta.title,
    description: content.meta.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      url,
      title: content.meta.title,
      description: content.meta.description,
    },
  };
}
