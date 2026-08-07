import type { Metadata } from "next";
import { BenchConsole } from "./bench-console";
import { EngineConsole } from "./engine-console";

/**
 * The Phase 1 benchmark harness, mounted **inside the real app**.
 *
 * Not a separate scaffold, on purpose. Gate G5 exists to prove the worker plus
 * `.wasm` boot path works, and the single most likely thing to break WASM
 * instantiation is the CSP — which only exists here, alongside `middleware.ts` and
 * the `/wasm/*` cache headers. A spike in a bare Next scaffold would exercise
 * none of them and would prove nothing about production.
 *
 * The `.dev.tsx` extension is the exclusion mechanism: `next.config.ts` adds it
 * to `pageExtensions` only when the harness is opted in, so in an ordinary build
 * this file is not a page and its module graph — gifski, mediabunny, modern-gif,
 * gifenc — is never bundled.
 *
 * The directory is named `%5F%5Fbench`, not `__bench`. An App Router folder
 * whose name starts with an underscore is a *private folder* and is excluded
 * from routing entirely — the route silently does not exist, with no error and
 * no warning. `%5F` is the escape that puts a literal underscore back into the
 * URL segment, so this file serves `/__bench` as the plan specifies.
 *
 * This page renders its own document because `[locale]/layout.tsx` is the root
 * layout and this route sits outside that segment.
 */

export const metadata: Metadata = {
  title: "PZGIF bench",
  robots: { index: false, follow: false },
};

export default function BenchPage() {
  return (
    <html lang="en">
      <body>
        <BenchConsole />
        <EngineConsole />
      </body>
    </html>
  );
}
