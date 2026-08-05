import wasmVersion from "../../wasm-version.json";

/**
 * Deployment-level facts. Everything here is read at build time so that the
 * pages stay statically prerenderable.
 */

export const SITE_NAME = "PZGIF";
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://pzgif.com";

/** Public repository holding the Corresponding Source (AGPL-3.0 §6). */
export const SOURCE_REPO_URL =
  process.env.NEXT_PUBLIC_SOURCE_REPO_URL ?? "https://github.com/pzgif/pzgif";

/**
 * The commit this bundle was built from.
 *
 * AGPL-3.0 §6 requires the Corresponding Source **for the version conveyed**. A
 * footer link to `main` breaks the moment production is ahead of, behind, or
 * diverged from it — a hotfix, a promoted preview, a rollback. So the link is
 * pinned to the exact SHA, and `scripts/check-source-sha.mjs` refuses to deploy
 * when that SHA is not pushed and publicly reachable.
 *
 * `VERCEL_GIT_COMMIT_SHA` and `CF_PAGES_COMMIT_SHA` are injected by the two
 * hosts under consideration; `PZGIF_COMMIT_SHA` is the explicit escape hatch for
 * any other CI.
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
