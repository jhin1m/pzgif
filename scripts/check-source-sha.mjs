#!/usr/bin/env node
/**
 * Refuses to deploy a bundle whose Corresponding Source is not publicly
 * obtainable.
 *
 * AGPL-3.0 §6 requires the source **for the version conveyed**. The footer link
 * is pinned to the build commit precisely so a hotfix, a promoted preview or a
 * rollback cannot silently point users at a tree that is not what they are
 * running. That guarantee is worth nothing if the commit is not reachable, so
 * this fetches it the way a stranger would.
 *
 * "The way a stranger would" is the whole point: asking the local checkout, or
 * asking `origin` with CI's credentials, proves only that CI can see it. Both a
 * private repository and a credentialled checkout answer yes. So this runs an
 * anonymous, credential-free fetch of the exact SHA from the public URL, in a
 * scratch repository with no remotes and no auth helpers.
 *
 * Run in CI immediately before the deploy step.
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Must resolve to the same SHA as `resolveCommitSha()` in next.config.ts,
 * including the `git rev-parse` fallback: this script proves the fetchability of
 * whatever that function bakes into the footer link, and any divergence would
 * prove it about a different commit.
 *
 * `||`, not `??` — a host that sets the variable to the empty string would
 * otherwise short-circuit the chain, and `next.config.ts` treats empty as absent.
 *
 * `WORKERS_CI_COMMIT_SHA` is Cloudflare Workers Builds; Pages uses
 * `CF_PAGES_COMMIT_SHA`, and the two are not interchangeable.
 *
 * This used to exit 0 outside CI, which quietly turned `pnpm deploy` into an
 * ungated deploy on a developer's machine — the one path where an unpushed
 * commit is likeliest. It now resolves the SHA the same way the build does and
 * checks it for real, wherever it runs.
 */
function resolveCommitSha() {
  const fromHost =
    process.env.PZGIF_COMMIT_SHA ||
    process.env.WORKERS_CI_COMMIT_SHA ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.CF_PAGES_COMMIT_SHA ||
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

const sha = resolveCommitSha();

if (!sha) {
  console.error(
    "No build commit SHA in the environment and no git checkout to fall back on." +
      "\nThe footer source link would degrade to the repository root, which is not" +
      "\na version-accurate source offer.",
  );
  process.exit(1);
}

if (!/^[0-9a-f]{40}$/i.test(sha)) {
  console.error(`Not a full commit SHA: ${sha}`);
  process.exit(1);
}

// Same default as `SOURCE_REPO_URL` in src/lib/site-config.ts, from the same
// file. Checking a different repository than the footer links to would make this
// gate pass while the link 404s, which is the exact failure it exists to stop.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoUrl =
  process.env.NEXT_PUBLIC_SOURCE_REPO_URL ??
  JSON.parse(readFileSync(join(repoRoot, "source-repo.json"), "utf8")).url;

const scratch = mkdtempSync(join(tmpdir(), "pzgif-source-offer-"));

/** No credentials, no config, no prompt — exactly what an outsider gets. */
const anonymousEnv = {
  ...process.env,
  GIT_TERMINAL_PROMPT: "0",
  GIT_ASKPASS: "true",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_SYSTEM: "/dev/null",
  // GitHub Actions injects an auth header for github.com via the extraheader
  // config; clearing the config files above is what strips it.
};

function git(args) {
  return execFileSync("git", args, {
    cwd: scratch,
    env: anonymousEnv,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  git(["init", "--quiet"]);
  git(["fetch", "--quiet", "--depth=1", repoUrl, sha]);
} catch (error) {
  console.error(
    `Commit ${sha} could not be fetched anonymously from ${repoUrl}.` +
      "\n\nDeploying it would convey a bundle whose Corresponding Source nobody" +
      "\ncan obtain, which is what AGPL-3.0 §6 forbids. Either the commit is not" +
      "\npushed, or the repository is not public.\n",
  );
  console.error(String(error.stderr ?? error));
  process.exit(1);
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log(`Source offer OK — anonymously fetchable: ${repoUrl}/tree/${sha}`);
