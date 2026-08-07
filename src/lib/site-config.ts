import sourceRepo from "../../source-repo.json";
import wasmVersion from "../../wasm-version.json";

/**
 * Deployment-level facts. Everything here is read at build time so that the
 * pages stay statically prerenderable.
 */

export const SITE_NAME = "PZGIF";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pzgif.com";

/**
 * Who runs this site, and where to reach them.
 *
 * These are facts about the deployment rather than prose, which is why they are
 * here and not in `src/content/`. They are also the three strings that must be
 * identical everywhere they appear — the About page, the Privacy Policy's
 * controller identification, the DMCA agent, `NOTICE` and `LICENSE-CONTENT`. A
 * support address that is right on one page and stale on another is a dead
 * channel for whoever reads the stale one, so the content files repeat these
 * values in prose and `legal.test.ts` asserts the prose agrees with these
 * constants.
 *
 * Naming a real operator is not decoration: it is what an ad-network reviewer
 * looks for, what GDPR Art. 13(1)(a) requires of a controller, and what makes
 * `LICENSE-CONTENT`'s "contact the operator named on the About page" mean
 * anything.
 */
export const OPERATOR_NAME = "Louis Le";
export const OPERATOR_LOCATION = "Australia";
export const CONTACT_EMAIL = "contact@pzgif.com";

/**
 * Whether an ad network is actually configured for this deployment.
 *
 * `design-guidelines.md` §8.2 requires a slot to be reserved in the initial HTML
 * so a fill cannot reflow the page. That law is about slots that will *hold*
 * something. Until a network is live there is nothing to reserve for, and a page
 * of empty grey boxes labelled "Advertisement" is worse than no box: it wastes
 * the viewport, reads as broken, and is exactly what an AdSense reviewer sees
 * during the application that is supposed to turn the flag on.
 *
 * So the decision is made **at build time**, never at runtime: the value is
 * inlined into the bundle, the server and the client render the same tree, and
 * the pages stay statically prerenderable. Flipping it is a redeploy, which is
 * the same ceremony as adding the ad script itself.
 *
 * Default off. Phase 10 sets `NEXT_PUBLIC_ADS_ENABLED=1` when the network is
 * approved and the slots have something to hold.
 */
export const ADS_ENABLED = process.env.NEXT_PUBLIC_ADS_ENABLED === "1";

/**
 * Public repository holding the Corresponding Source (AGPL-3.0 §6).
 *
 * The default lives in `source-repo.json` because `scripts/check-source-sha.mjs`
 * needs the same value, and a literal in both files is what let it be wrong in
 * both at once for the whole of Phase 2 — pointing the footer's Source link at a
 * repository that does not exist.
 */
export const SOURCE_REPO_URL =
  process.env.NEXT_PUBLIC_SOURCE_REPO_URL ?? sourceRepo.url;

/**
 * The commit this bundle was built from.
 *
 * AGPL-3.0 §6 requires the Corresponding Source **for the version conveyed**. A
 * footer link to `main` breaks the moment production is ahead of, behind, or
 * diverged from it — a hotfix, a promoted preview, a rollback. So the link is
 * pinned to the exact SHA, and `scripts/check-source-sha.mjs` refuses to deploy
 * when that SHA is not pushed and publicly reachable.
 *
 * The value is resolved in `next.config.ts` and inlined through `env`, so the
 * host variables are read at build time and nothing here reads the environment
 * at runtime. `WORKERS_CI_COMMIT_SHA` is the one Cloudflare Workers Builds
 * injects — distinct from Pages' `CF_PAGES_COMMIT_SHA`, and the reason this
 * chain silently missed on the host that was actually chosen.
 */
export const BUILD_COMMIT_SHA =
  process.env.NEXT_PUBLIC_COMMIT_SHA?.trim() || "";

/** Link to the exact source of this deployment, or the repo root if unknown. */
export const sourceUrlForThisBuild = BUILD_COMMIT_SHA
  ? `${SOURCE_REPO_URL}/tree/${BUILD_COMMIT_SHA}`
  : SOURCE_REPO_URL;

/**
 * Bump `wasm-version.json` when the contents of `public/wasm/` change. The
 * filenames carry no content hash, so the version segment in the path is what
 * makes the `immutable` cache header safe — and a year-long immutable cache
 * pointed at a stale binary is not something a redeploy can fix.
 *
 * The value lives in JSON because `scripts/copy-wasm.mjs` needs it too, and a
 * "keep these in sync" comment across two files is a drift waiting to happen.
 */
export const WASM_VERSION = wasmVersion.version;
export const WASM_BASE_PATH = `/wasm/${WASM_VERSION}`;
