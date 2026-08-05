import { execFileSync } from "node:child_process";
import createNextIntlPlugin from "next-intl/plugin";
import type { NextConfig } from "next";
import { WASM_BASE_PATH } from "./src/lib/site-config";

/**
 * `output` is deliberately absent.
 *
 * `output: "export"` would remove the proxy, and next-intl's
 * `localePrefix: "as-needed"` needs it to rewrite `/gif-compressor` onto
 * `/en/gif-compressor`. A static export would pin English behind `/en/` forever
 * — exactly the future URL migration this project is avoiding. It would also
 * remove `headers()`, which is where the CSP below lives.
 *
 * `cacheComponents` is off: there is zero server data to cache.
 */

/**
 * Content-Security-Policy.
 *
 * `'wasm-unsafe-eval'` is the narrow directive that permits
 * `WebAssembly.instantiate`. Never widen it to `'unsafe-eval'`.
 *
 * ── Do not add a hash or a nonce to `script-src` ──────────────────────────────
 * The App Router streams its RSC payload through inline
 * `self.__next_f.push(...)` tags on every statically prerendered page. Those are
 * generated per page, so they cannot be enumerated in a global header.
 *
 * Per the CSP spec, **`'unsafe-inline'` is ignored the moment a hash or nonce is
 * present in the same directive.** Adding the theme script's hash therefore does
 * not tighten the policy — it blocks every Next payload script, and the site
 * silently stops hydrating: no theme toggle, no service worker, no tool. This
 * was observed, not assumed; `e2e/app-shell.spec.ts` locks it down.
 *
 * The alternative is a per-request nonce, which forces dynamic rendering and
 * breaks this phase's rule that every route is statically prerendered. So
 * `'unsafe-inline'` stands until Next offers a static-friendly option.
 *
 * Nothing here may introduce cross-origin isolation. It breaks Google ad
 * serving, and that is the revenue model.
 *
 * Phase 10 will need to extend `script-src` / `frame-src` / `connect-src` for
 * the ad network and the CMP. Keep the policy in this one place so that stays a
 * one-line change.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  // Recovers most of what 'unsafe-inline' above costs: inline event-handler
  // attributes and javascript: URLs stay blocked, which is the injection shape
  // that actually shows up. Next's payload scripts are elements, not attributes.
  "script-src-attr 'none'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // `upgrade-insecure-requests` is deliberately absent. It buys nothing here —
  // `default-src 'self'` already blocks every cross-origin subresource — and
  // WebKit applies it to loopback origins, so it upgrades http://127.0.0.1 to
  // https and every script dies on a TLS error. That silently breaks Safari E2E
  // and any plain-HTTP staging host. HTTPS enforcement belongs at the edge:
  // Cloudflare "Always Use HTTPS" plus HSTS, per docs/infrastructure-runbook.md.
].join("; ");

/**
 * The commit this bundle is built from, for the AGPL source offer. Host-injected
 * values win; `git rev-parse` is the local-development fallback.
 */
function resolveCommitSha(): string {
  const fromHost =
    process.env.PZGIF_COMMIT_SHA ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.CF_PAGES_COMMIT_SHA ??
    process.env.GITHUB_SHA;
  if (fromHost) return fromHost.trim();

  try {
    return execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

/**
 * The Phase 1 benchmark harness route.
 *
 * `/__bench` must not exist in a shipped build — not merely 404, but never
 * bundled, so its raw encoder surface cannot be reached and its imports cannot
 * inflate the production JS.
 *
 * A runtime `NODE_ENV` check inside the page would not achieve that: the module
 * still compiles and its imports still bundle. Extending `pageExtensions`
 * instead means `page.dev.tsx` is only *recognised as a page* when enabled. When
 * it is not, nothing in `__bench/` matches a page extension, so the route does
 * not exist and neither does its module graph.
 *
 * The opt-in is an explicit env var rather than `NODE_ENV === "development"`
 * alone, because gate G5 has to prove the worker and `.wasm` boot **in a
 * production build** — under the production CSP, with the real
 * `immutable`-cached `/wasm/*` headers, and through whatever Turbopack does to a
 * TypeScript module worker when it optimises. A dev-only route cannot be asked
 * that question at all. `PZGIF_ENABLE_BENCH=1 pnpm build` answers it; ordinary
 * builds do not set the flag, and `e2e/app-shell.spec.ts` asserts the 404.
 */
const benchRouteEnabled =
  process.env.NODE_ENV === "development" ||
  process.env.PZGIF_ENABLE_BENCH === "1";

const devOnlyPageExtensions = benchRouteEnabled ? ["dev.tsx"] : [];

const nextConfig: NextConfig = {
  pageExtensions: [...devOnlyPageExtensions, "tsx", "ts", "jsx", "js"],
  env: {
    NEXT_PUBLIC_COMMIT_SHA: resolveCommitSha(),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
      {
        // The `.wasm` filenames carry no content hash, so the version segment in
        // the path is what makes `immutable` safe. Bump WASM_VERSION on change.
        source: `${WASM_BASE_PATH}/:path*`,
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
      {
        // A stale service worker would pin users to an old app shell.
        source: "/sw.js",
        headers: [{ key: "Cache-Control", value: "no-cache" }],
      },
    ];
  },
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
