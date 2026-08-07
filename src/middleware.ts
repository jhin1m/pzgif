import createMiddleware from "next-intl/middleware";
import { routing } from "@/i18n/routing";

/**
 * This file is `middleware.ts` **on purpose**, and it used to be `proxy.ts`.
 *
 * Next 16 renamed the file and made the new name Node-runtime-only. That is the
 * problem: `@opennextjs/cloudflare@1.20.2` refuses a Node.js proxy at build time
 * — "Node.js middleware is not currently supported" — and there is no flag, no
 * newer release and no config that gets past it (issue opennextjs-cloudflare#962).
 * Next still accepts the deprecated name and runs it on the Edge runtime, which
 * the adapter does support, and next-intl needs nothing this file cannot do
 * there. Measured on workerd: every route serves, which is not true with
 * `proxy.ts` at any setting.
 *
 * **Rename this to `src/proxy.ts` the moment the adapter supports a Node.js
 * proxy** — check its release notes at each upgrade. The deprecated name is on a
 * removal path, so this is a debt with a deadline set by someone else. If Next
 * drops `middleware.ts` before the adapter lands support, the host decision goes
 * back on the table; Vercel Pro was the costed fallback.
 *
 * With `localePrefix: "as-needed"` this file is what rewrites the prefix-free
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
