import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * Next 16 renamed `middleware.ts` to `proxy.ts`; the old name is deprecated and
 * slated for removal, so this file must not be renamed back.
 *
 * With `localePrefix: "as-needed"` this proxy is what rewrites the prefix-free
 * English URL `/gif-compressor` onto the `[locale]` segment. That is also why
 * `output: "export"` is rejected in next.config.ts — a static export has no
 * proxy, and English would be stuck behind `/en/` forever.
 */
export default createMiddleware(routing);

export const config = {
  /**
   * Match every path except Next internals, the API surface, and anything that
   * looks like a static file. `/wasm/...`, `/sw.js` and the SEO files must
   * never be rewritten through the locale proxy.
   *
   * `__bench` is excluded because the dev-only benchmark harness sits outside
   * the `[locale]` segment and renders its own document; rewriting it to
   * `/en/__bench` would 404 a route that exists.
   */
  matcher: ["/((?!api|_next|_vercel|wasm|__bench|.*\\..*).*)"],
};
