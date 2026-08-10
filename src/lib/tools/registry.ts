/**
 * The single typed source of truth for site *structure*: slugs, display names,
 * accepted input formats, produced output formats, and which tools relate to
 * which. Navigation, the footer, the related-tools block and the sitemap all
 * read from here so they can never drift apart.
 *
 * HARD RULE: this file owns structure, never prose. No explainer paragraphs, no
 * FAQ answers, no meta descriptions. Template-filled copy across 14
 * near-identical pages is exactly what Google's scaled-content-abuse policy
 * penalises, and that penalty is site-wide, not per-page. Per-tool prose lives
 * in hand-written content modules (Phase 9).
 *
 * Scope is fixed at 9 tools plus the Discord cluster. `GIF → WebP` and the Slack
 * preset appear in the wireframe footer but are cut; the footer here is the
 * corrected inventory.
 */

export type MediaFormat =
  "gif" | "mp4" | "webm" | "mov" | "webp" | "png" | "zip";

/** Footer/nav grouping. Also the order groups are rendered in. */
export type ToolGroup = "edit" | "convert" | "presets";

/**
 * Whether the route has a page behind it in *this* deployment.
 *
 * The plan ships in five stages, so for most of the build the registry
 * describes more routes than exist. Anything that emits a link a crawler or a
 * visitor will follow — the sitemap, the related-tools block — has to filter on
 * this, or the first crawl of a new domain is a page of 404s.
 */
export type RouteStatus = "live" | "planned";

export interface ToolDefinition {
  /** URL segment. English serves prefix-free, e.g. /gif-compressor. */
  readonly slug: string;
  /** Short label for nav, footer and cards. Not marketing copy. */
  readonly name: string;
  readonly group: ToolGroup;
  /** Defaults to "planned" — a route is live only once its page ships. */
  readonly status?: RouteStatus;
  readonly inputFormats: readonly MediaFormat[];
  readonly outputFormats: readonly MediaFormat[];
  /** Slugs of tools worth offering next. Validated to exist and not self-refer. */
  readonly related: readonly string[];
}

export interface PresetRouteDefinition extends ToolDefinition {
  readonly group: "presets";
  /** A hub route renders the chip picker; the rest default to one preset. */
  readonly isHub: boolean;
}

export const TOOLS: readonly ToolDefinition[] = [
  {
    slug: "gif-compressor",
    name: "GIF compressor",
    group: "edit",
    status: "live",
    inputFormats: ["gif"],
    outputFormats: ["gif"],
    related: ["resize-gif", "gif-speed-changer", "gif-for-discord"],
  },
  {
    slug: "resize-gif",
    name: "Resize GIF",
    group: "edit",
    status: "live",
    inputFormats: ["gif"],
    outputFormats: ["gif"],
    related: ["crop-gif", "gif-compressor", "gif-for-discord"],
  },
  {
    slug: "crop-gif",
    name: "Crop GIF",
    group: "edit",
    status: "live",
    inputFormats: ["gif"],
    outputFormats: ["gif"],
    related: ["resize-gif", "gif-compressor", "gif-for-discord"],
  },
  {
    slug: "gif-speed-changer",
    name: "GIF speed changer",
    group: "edit",
    status: "live",
    inputFormats: ["gif"],
    outputFormats: ["gif"],
    related: ["reverse-gif", "gif-compressor", "resize-gif"],
  },
  {
    slug: "reverse-gif",
    name: "Reverse GIF",
    group: "edit",
    status: "live",
    inputFormats: ["gif"],
    outputFormats: ["gif"],
    related: ["gif-speed-changer", "gif-compressor", "crop-gif"],
  },
  {
    slug: "mp4-to-gif",
    name: "MP4 to GIF",
    group: "convert",
    status: "live",
    inputFormats: ["mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-compressor", "gif-to-mp4", "gif-for-discord"],
  },
  {
    slug: "gif-to-mp4",
    name: "GIF to MP4",
    group: "convert",
    status: "live",
    inputFormats: ["gif"],
    outputFormats: ["mp4"],
    related: ["mp4-to-gif", "gif-compressor"],
  },
  {
    slug: "webp-to-gif",
    name: "WebP to GIF",
    group: "convert",
    status: "live",
    inputFormats: ["webp"],
    outputFormats: ["gif"],
    related: ["gif-compressor", "mp4-to-gif"],
  },
  {
    slug: "split-gif-to-frames",
    name: "Split GIF to frames",
    group: "convert",
    status: "live",
    inputFormats: ["gif"],
    outputFormats: ["png", "zip"],
    related: ["reverse-gif", "gif-speed-changer"],
  },
] as const;

export const PRESET_ROUTES: readonly PresetRouteDefinition[] = [
  {
    slug: "gif-for-discord",
    name: "GIF for Discord",
    group: "presets",
    status: "live",
    isHub: true,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["discord-emoji-gif", "discord-sticker-gif", "gif-compressor"],
  },
  {
    slug: "discord-emoji-gif",
    name: "Discord emoji GIF",
    group: "presets",
    status: "live",
    isHub: false,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-for-discord", "discord-sticker-gif", "resize-gif"],
  },
  {
    slug: "discord-sticker-gif",
    name: "Discord sticker GIF",
    group: "presets",
    status: "live",
    isHub: false,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-for-discord", "discord-emoji-gif", "gif-compressor"],
  },
  {
    slug: "discord-banner-gif",
    name: "Discord banner GIF",
    group: "presets",
    status: "live",
    isHub: false,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-for-discord", "discord-avatar-gif", "crop-gif"],
  },
  {
    slug: "discord-avatar-gif",
    name: "Discord avatar GIF",
    group: "presets",
    status: "live",
    isHub: false,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-for-discord", "discord-banner-gif", "crop-gif"],
  },
] as const;

/** Every routed tool page, tools first then presets. */
export const ALL_ROUTES: readonly ToolDefinition[] = [
  ...TOOLS,
  ...PRESET_ROUTES,
];

/**
 * A legal or trust page. Structure only, exactly like a tool route.
 *
 * ── Why these live in the registry but outside `ALL_ROUTES` ─────────────────
 * The footer and the sitemap must not be able to disagree with reality about
 * which pages exist, and this file is the one place that answers that question.
 * But a legal page is not a tool: it has no input or output formats, nothing
 * routes a file to it, and it must never appear in the tool nav, the related
 * grid or `chainTargets()`. Keeping it a separate array and a separate type
 * means every existing consumer of `ALL_ROUTES` keeps the exact meaning it has
 * today, and none of them had to be audited for this addition.
 *
 * `name` is a nav label, not prose — same class of string as a tool's `name`.
 * Every word of the pages themselves lives in `src/content/legal/`.
 */
export interface LegalRoute {
  /** URL segment, and the filename of its content file. */
  readonly slug: string;
  /** Footer label. */
  readonly name: string;
}

/**
 * The six pages this deployment serves, in footer order.
 *
 * Trust-building pages first, obligations after: a visitor deciding whether to
 * drop a file scans for "who is this", not for "what are the terms".
 *
 * Acceptable Use and an Accessibility statement complete the set of eight the
 * plan calls for. They are not listed here because they are not built, and a
 * footer link to a page that does not exist is a 404 in the internal link graph
 * — the same rule `status: "live"` enforces for tools.
 */
export const LEGAL_ROUTES: readonly LegalRoute[] = [
  { slug: "about", name: "About" },
  { slug: "contact", name: "Contact" },
  { slug: "terms", name: "Terms" },
  { slug: "privacy", name: "Privacy" },
  { slug: "cookies", name: "Cookie Policy" },
  { slug: "dmca", name: "DMCA" },
] as const;

export const TOOL_GROUP_ORDER: readonly ToolGroup[] = [
  "edit",
  "convert",
  "presets",
];

const BY_SLUG = new Map(ALL_ROUTES.map((route) => [route.slug, route]));

export function getRoute(slug: string): ToolDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function routesInGroup(group: ToolGroup): readonly ToolDefinition[] {
  return ALL_ROUTES.filter((route) => route.group === group);
}

export function relatedRoutes(slug: string): readonly ToolDefinition[] {
  const route = getRoute(slug);
  if (!route) return [];
  return route.related
    .map((relatedSlug) => BY_SLUG.get(relatedSlug))
    .filter((related): related is ToolDefinition => related !== undefined);
}

/** True when the route has a page in this deployment. */
export function isLive(route: ToolDefinition): boolean {
  return route.status === "live";
}

/** Routes a crawler may be pointed at. The sitemap's only legitimate source. */
export function liveRoutes(): readonly ToolDefinition[] {
  return ALL_ROUTES.filter(isLive);
}

/**
 * Every input format some live route accepts.
 *
 * The homepage's `accept` list, and it is a union rather than an intersection on
 * purpose: the homepage does not know which tool the visitor wants yet, so it
 * has to take anything any live tool could work on and let the picker decide
 * afterwards. Today every live route is GIF-only, so this is `["gif"]` — and it
 * widens on its own when the first cross-format tool ships.
 */
export function liveInputFormats(): readonly MediaFormat[] {
  const formats = new Set<MediaFormat>();
  for (const route of liveRoutes()) {
    for (const format of route.inputFormats) formats.add(format);
  }
  return [...formats];
}

/**
 * Related tools that actually exist yet.
 *
 * Kept separate from `relatedRoutes()` rather than filtering it in place: the
 * unfiltered list is what the registry test asserts against, and it is what a
 * future "coming soon" surface would want.
 */
export function relatedLiveRoutes(slug: string): readonly ToolDefinition[] {
  return relatedRoutes(slug).filter(isLive);
}

/**
 * Related live routes that can decode what this tool just produced.
 *
 * Kept apart from `relatedLiveRoutes()` because the two answer different
 * questions. The foot-of-page grid is written for a reader who is still
 * browsing and holds no file, so every live sibling is a fair suggestion there
 * and format has no bearing on it. This one is read by someone holding a
 * finished file, and a destination that cannot open that file is worse than no
 * destination at all.
 *
 * Today every live route is GIF→GIF, so the filter removes nothing. Its entire
 * value is the first cross-format tool: without it a chip would hand the `.zip`
 * from `split-gif-to-frames` straight to `crop-gif`, which dies as
 * `decode-failed` — the generic bucket the "never a dead end" rule exists to
 * keep files out of.
 *
 * Author order from `related` survives the filter: it is an editorial sequence,
 * not an alphabetical accident.
 */
export function chainTargets(
  slug: string,
  produced: MediaFormat,
): readonly ToolDefinition[] {
  return relatedLiveRoutes(slug).filter((route) =>
    route.inputFormats.includes(produced),
  );
}
