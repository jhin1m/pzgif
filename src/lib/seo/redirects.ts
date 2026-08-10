/**
 * Permanent redirects for tool slugs that have been renamed.
 *
 * ── Why this exists before there is anything in it ──────────────────────────
 * The ability to redirect is the stated reason `output: "export"` was rejected
 * in `next.config.ts`: a static export cannot 301 an old URL, so a renamed tool
 * would drop every link and every scrap of index age pointing at its old slug.
 * A domain whose entire strategy is index age cannot afford to lose it to a
 * rename. So the mechanism ships now, wired and typed, and adding a rename later
 * is one entry here rather than a hunt for where redirects are supposed to go.
 *
 * ── The rule for adding one ─────────────────────────────────────────────────
 * When a tool slug changes, its `registry.ts` entry moves to the new slug and a
 * `{ from: <old>, to: <new> }` pair is added below. `from` must be a slug no
 * live route uses — a redirect that shadows a real page would 308 that page away
 * — and `to` must be a live route. `redirects.test.ts` asserts both for every
 * entry, so a rename that got either wrong fails CI rather than silently hiding a
 * page. These are 308s: a rename is permanent, and a permanent redirect is what
 * passes ranking signals to the new URL.
 *
 * ── The one locale today ────────────────────────────────────────────────────
 * `localePrefix: "as-needed"` serves English prefix-free, so an old slug arrives
 * as `/<slug>` and `withLocale()` below matches it directly. When locale #2
 * lands, the prefixed form is added here in one place, the same way
 * `alternatesFor()` waits to emit hreflang.
 */

export interface ToolRename {
  /** The retired slug. Must not collide with any live route. */
  readonly from: string;
  /** The slug it now lives at. */
  readonly to: string;
}

/**
 * The renames, in the order they happened. Empty by design: no tool has been
 * renamed yet. Each entry added here becomes a permanent redirect at the edge.
 */
export const TOOL_RENAMES: readonly ToolRename[] = [] as const;

/**
 * Expands the rename list into the redirect objects `next.config.ts` returns.
 *
 * Kept out of the config file so the list itself stays a plain data structure
 * the registry test can read, rather than something buried in build wiring.
 *
 * The return type is left to inference rather than annotated with next's public
 * `Redirect`: `next.config`'s `redirects()` is typed against an internal variant
 * of that name, and the two are not assignable to each other. A plain object
 * literal with `source`/`destination`/`permanent` matches the internal shape
 * structurally, which is what the config actually needs.
 */
export function toolRedirects() {
  return TOOL_RENAMES.map(({ from, to }) => ({
    source: `/${from}`,
    destination: `/${to}`,
    permanent: true as const,
  }));
}
