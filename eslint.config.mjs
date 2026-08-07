import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      /**
       * Import bans that protect the two things this project cannot recover
       * from: cross-origin isolation (which kills ad revenue) and a 25-65 MB
       * ffmpeg bundle leaking onto the default path.
       *
       * `scripts/check-forbidden-headers.mjs` enforces the same constraint
       * textually. Both exist on purpose — this rule gives the fast in-editor
       * signal, the script catches anything ESLint does not parse.
       */
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "gifski-wasm/multi-thread",
              message:
                "Multi-threaded gifski needs SharedArrayBuffer, which needs cross-origin isolation, which breaks Google ad serving. Use the single-thread build.",
            },
            {
              name: "gifski-wasm/cloudflare",
              message:
                "The Cloudflare build targets a server runtime. The free tier runs entirely in the user's tab.",
            },
            {
              name: "@ffmpeg/core-mt",
              message:
                "The multi-thread ffmpeg core needs SharedArrayBuffer. Use the single-thread core.",
            },
          ],
          patterns: [
            {
              group: ["@ffmpeg/*"],
              message:
                "ffmpeg is a lazy-loaded last resort for containers WebCodecs cannot handle. Import it only from src/lib/media/ffmpeg-fallback.ts, so it can never end up on the default path.",
            },
          ],
        },
      ],
    },
  },

  {
    // The single module allowed to reach for the ffmpeg fallback.
    files: ["src/lib/media/ffmpeg-fallback.ts"],
    rules: { "no-restricted-imports": "off" },
  },

  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Ours:
    "playwright-report/**",
    "test-results/**",
    // The Cloudflare adapter's build output: a bundled copy of the Next server
    // plus our own compiled code. Linting it reports thousands of problems in
    // third-party bundles and, worse, reports them against files that are
    // regenerated on every build — so `pnpm lint` would pass or fail depending
    // on whether `pnpm cf:build` had run.
    ".open-next/**",
    ".wrangler/**",
  ]),
]);

export default eslintConfig;
