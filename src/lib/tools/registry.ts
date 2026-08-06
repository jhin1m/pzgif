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
    inputFormats: ["mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-compressor", "gif-to-mp4", "gif-for-discord"],
  },
  {
    slug: "gif-to-mp4",
    name: "GIF to MP4",
    group: "convert",
    inputFormats: ["gif"],
    outputFormats: ["mp4"],
    related: ["mp4-to-gif", "gif-compressor"],
  },
  {
    slug: "webp-to-gif",
    name: "WebP to GIF",
    group: "convert",
    inputFormats: ["webp"],
    outputFormats: ["gif"],
    related: ["gif-compressor", "mp4-to-gif"],
  },
  {
    slug: "split-gif-to-frames",
    name: "Split GIF to frames",
    group: "convert",
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
    isHub: true,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["discord-emoji-gif", "discord-sticker-gif", "gif-compressor"],
  },
  {
    slug: "discord-emoji-gif",
    name: "Discord emoji GIF",
    group: "presets",
    isHub: false,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-for-discord", "discord-sticker-gif", "resize-gif"],
  },
  {
    slug: "discord-sticker-gif",
    name: "Discord sticker GIF",
    group: "presets",
    isHub: false,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-for-discord", "discord-emoji-gif", "gif-compressor"],
  },
  {
    slug: "discord-banner-gif",
    name: "Discord banner GIF",
    group: "presets",
    isHub: false,
    inputFormats: ["gif", "mp4", "webm", "mov"],
    outputFormats: ["gif"],
    related: ["gif-for-discord", "discord-avatar-gif", "crop-gif"],
  },
  {
    slug: "discord-avatar-gif",
    name: "Discord avatar GIF",
    group: "presets",
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
