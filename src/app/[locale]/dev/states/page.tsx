import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";
import { AdSlot } from "@/components/ads/ad-slot";
import { LoopMark } from "@/components/brand/marks";
import { ConsentBar } from "@/components/layout/consent-bar";
import { TrustLine } from "@/components/layout/trust-line";
import { BeforeAfterSlider } from "@/components/tool/before-after-slider";
import { Dropzone } from "@/components/tool/dropzone";
import { FileChip } from "@/components/tool/file-chip";
import { ProgressBar } from "@/components/tool/progress-bar";
import { NextTools } from "@/components/tool/next-tools";
import {
  ResultPanel,
  ResultSummary,
  SizeDelta,
} from "@/components/tool/result-panel";
import { SettingsPanel } from "@/components/tool/settings-panel";
import { StickyActionBar } from "@/components/tool/sticky-action-bar";
import { Accordion } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PresetChip } from "@/components/ui/preset-chip";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { SwitchField } from "@/components/ui/switch";
import { ToastCard } from "@/components/ui/toast";
import { AFTER_FRAME, BEFORE_FRAME } from "./sample-frames";

/**
 * `/dev/states` — the production mirror of `docs/wireframe/states.html`.
 *
 * It exists for three reasons, in descending order of importance:
 *
 *  1. **Drift detection.** The wireframe is the visual source of truth for §5.
 *     Reviewing 18 components against it one page at a time is how drift gets
 *     missed; side by side on one screen it is obvious.
 *  2. **The visual regression target for Phase 11.** One route, every state, both
 *     themes — a screenshot diff here covers the whole library.
 *  3. **The keyboard sweep.** Tabbing this page reaches every interactive
 *     control in the product exactly once.
 *
 * It is `noindex` and absent from the sitemap. It is *not* excluded from the
 * build: the components it renders are the shipped ones, so a build that cannot
 * render this page is a build with a broken component library, and finding that
 * out in CI is the point.
 */

export const metadata: Metadata = {
  title: "Component & state gallery",
  robots: { index: false, follow: false },
};

export default async function DevStatesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main id="main" className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6">
      <h1 className="text-h1 font-bold">PZGIF component &amp; state gallery</h1>
      <p className="mt-2 max-w-[70ch] text-lead text-fg-secondary">
        Every component in <code>docs/design-guidelines.md</code> §5, rendered
        in both themes. Hover and focus states are shown live where you can
        interact with them, and force-applied via <code>forceState</code> so
        they survive a screenshot.
      </p>

      <Section
        title="Colour — semantic tokens"
        note="The same token names resolve differently per theme. Measured contrast ratios are in §7.1."
      >
        <Swatches />
      </Section>

      <Section
        title="Type scale"
        note="Space Grotesk display · Hanken Grotesk UI · JetBrains Mono numbers."
      >
        <TypeScale />
      </Section>

      <Section
        title="Radius & shadow"
        note="6px is a reserved word: ad slots only. The mismatch against the 16px product-card radius is the visual quarantine."
      >
        <RadiusAndShadow />
      </Section>

      <Section
        title="Brand motif & mark"
        note="The checkerboard means 'an image belongs here' — media and empty surfaces only, never behind text. The personified mark is for surfaces that are waiting, not working."
      >
        <Motif />
      </Section>

      <Section
        title="Button"
        note="Primary / Secondary / Ghost / Danger × default, hover, active, focus-visible, disabled, loading. Sizes sm 32 · md 40 · lg 48 · xl 56."
      >
        <Buttons />
      </Section>

      <Section
        title="Dropzone"
        note="Idle / hover / focus / drag-over / invalid file. The box never changes size between states."
      >
        <Dropzones />
      </Section>

      <Section
        title="FileChip"
        note="Default / hover / focus on remove / truncation at 22ch / error."
      >
        <FileChips />
      </Section>

      <Section
        title="Slider · Select · Toggle · Preset chip"
        note="Native range and Radix Select, so keyboard support is the platform's."
      >
        <Controls />
      </Section>

      <Section
        title="ProgressBar"
        note="Indeterminate / determinate / complete / error. No transition on the fill width — it maps 1:1 to worker callbacks."
      >
        <Progress />
      </Section>

      <Section
        title="BeforeAfterSlider"
        note="Pointer-tracked, keyboard-operable, no transition on position. The static pair is the documented fallback for oversized GIFs."
      >
        <BeforeAfter />
      </Section>

      <Section
        title="ResultPanel"
        note="Empty reserves the space; both states share the same min-height."
      >
        <Results />
      </Section>

      <Section
        title="AdSlot — visual quarantine"
        note="Beside a product card at the same width. If a reviewer cannot tell them apart in under a second, the layout fails."
      >
        <Ads />
      </Section>

      <Section
        title="Toast"
        note="Success auto-dismisses at 6s; error and warning never do."
      >
        <Toasts />
      </Section>

      <Section
        title="Accordion"
        note="Closed / open / focus. Answers stay in the DOM in every state — that is what keeps them crawlable."
      >
        <Accordions />
      </Section>

      <Section title="Badges, trust line & size delta">
        <Badges />
      </Section>

      <Section
        title="StickyActionBar"
        note="Mobile only in production (64px, below md, once a file is loaded). Shown here at every width so the gallery covers it; the anchor ad and consent bar stand down while it is up."
      >
        <ActionBar />
      </Section>

      <Section
        title="Consent bar"
        note="Specified in Phase 3, wired in Phase 10. A compact bottom bar with reserved height — never an overlay, and never while the sticky action bar is up."
      >
        <Consent />
      </Section>

      <p className="mt-10 text-sm text-fg-muted">
        Missing on purpose: modal (no MVP flow has one) and tooltip (used only
        to explain a disabled primary; spec in §5).
      </p>
    </main>
  );
}

/* ── Gallery scaffolding ─────────────────────────────────────────────────── */

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-10">
      <h2 className="text-h2 font-bold">{title}</h2>
      {note ? (
        <p className="mb-3.5 mt-1 max-w-[80ch] text-label text-fg-muted">
          {note}
        </p>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-2">
        <Pane theme="light">{children}</Pane>
        <Pane theme="dark">{children}</Pane>
      </div>
    </section>
  );
}

/**
 * A themed pane. The semantic tokens are redefined on `[data-theme]`, so nesting
 * one inside the page flips its whole subtree — which is exactly why components
 * are required to consume semantics rather than primitives.
 */
function Pane({
  theme,
  children,
}: {
  theme: "light" | "dark";
  children: React.ReactNode;
}) {
  return (
    <div
      data-theme={theme}
      className="rounded-card border border-line bg-bg p-5 text-fg"
      style={{ colorScheme: theme }}
    >
      <p className="tabular mb-3 text-micro uppercase text-fg-muted">{theme}</p>
      {children}
    </div>
  );
}

function Row({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    // Stacked below `sm`, and the content cell is `min-w-0`: a `1fr` track is
    // `minmax(auto, 1fr)`, so a `whitespace-nowrap` button inside it cannot
    // shrink and would push the document past 320px — which the gallery must
    // survive, because §9 forbids horizontal scroll there like anywhere else.
    <div className="grid grid-cols-1 items-center gap-3 border-b border-dashed border-line py-2.5 last:border-b-0 sm:grid-cols-[110px_minmax(0,1fr)]">
      <span className="tabular text-caption text-fg-muted">{name}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-2.5">
        {children}
      </span>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="tabular mb-3 mt-4 text-micro uppercase text-fg-muted first:mt-0">
      {children}
    </p>
  );
}

/* ── Foundations ─────────────────────────────────────────────────────────── */

const SEMANTIC_TOKENS = [
  "--bg",
  "--surface-1",
  "--surface-2",
  "--surface-ad",
  "--border",
  "--border-control",
  "--text",
  "--text-secondary",
  "--text-muted",
  "--text-disabled",
  "--text-ad-label",
  "--primary",
  "--primary-fill",
  "--primary-fill-hover",
  "--primary-hover",
  "--accent",
  "--accent-text",
  "--success",
  "--warning",
  "--danger",
  "--focus-ring",
] as const;

function Swatches() {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(104px,1fr))] gap-2">
      {SEMANTIC_TOKENS.map((token) => (
        <div
          key={token}
          className="overflow-hidden rounded-control border border-line"
        >
          <div className="h-11" style={{ background: `var(${token})` }} />
          <span className="tabular block bg-surface-1 px-1.5 py-1 text-[0.625rem] text-fg-muted">
            {token.replace("--", "")}
          </span>
        </div>
      ))}
    </div>
  );
}

function TypeScale() {
  return (
    <div>
      <TypeRow token="--text-display">
        <span className="font-display text-display font-bold tracking-[-0.02em]">
          Shrink it
        </span>
      </TypeRow>
      <TypeRow token="--text-h1">
        <span className="font-display text-h1 font-bold tracking-[-0.02em]">
          GIF Compressor
        </span>
      </TypeRow>
      <TypeRow token="--text-h2">
        <span className="font-display text-h2 font-bold">
          How compression works
        </span>
      </TypeRow>
      <TypeRow token="--text-h3">
        <span className="font-display text-h3 font-medium">
          Which setting first?
        </span>
      </TypeRow>
      <TypeRow token="--text-lead">
        <span className="text-lead text-fg-secondary">
          Cut a GIF by 60–85%.
        </span>
      </TypeRow>
      <TypeRow token="--text-body">
        <span className="text-body">
          Body copy at 1rem / 1.6, capped at 68ch.
        </span>
      </TypeRow>
      <TypeRow token="--text-sm">
        <span className="text-sm">Helper and secondary UI text.</span>
      </TypeRow>
      <TypeRow token="--text-label">
        <span className="text-label font-semibold">Quality</span>
      </TypeRow>
      <TypeRow token="--text-caption">
        <span className="text-caption text-fg-muted">Max 150 MB · .gif</span>
      </TypeRow>
      <TypeRow token="--text-micro">
        <span className="text-micro font-semibold uppercase text-fg-ad-label">
          Advertisement
        </span>
      </TypeRow>
      <TypeRow token="mono / tabular">
        <span className="tabular">2.4 MB → 480 KB · 640×360 · 20 fps</span>
      </TypeRow>
    </div>
  );
}

function TypeRow({
  token,
  children,
}: {
  token: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline gap-4 border-b border-dashed border-line py-2">
      <span className="tabular w-[130px] flex-none text-micro text-fg-muted">
        {token}
      </span>
      {children}
    </div>
  );
}

const RADII = [
  ["rounded-xs", "xs 4 · progress"],
  ["rounded-ad", "ad 6 · ADS ONLY"],
  ["rounded-control", "control 8 · button"],
  ["rounded-panel", "panel 12 · toast"],
  ["rounded-card", "card 16 · panels"],
  ["rounded-pill", "pill · chips"],
] as const;

function RadiusAndShadow() {
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {RADII.map(([className, caption]) => (
          <figure key={className} className="m-0 text-center">
            <div
              className={`h-14 w-18 border border-line bg-surface-2 ${className}`}
            />
            <figcaption
              className={`tabular mt-1.5 text-[0.625rem] ${
                className === "rounded-ad"
                  ? "text-danger-text"
                  : "text-fg-muted"
              }`}
            >
              {caption}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-4">
        {(["shadow-sm", "shadow-md", "shadow-lg"] as const).map((shadow) => (
          <figure key={shadow} className="m-0 text-center">
            <div className={`h-15 w-22 rounded-card bg-bg ${shadow}`} />
            <figcaption className="tabular mt-1.5 text-[0.625rem] text-fg-muted">
              {shadow}
            </figcaption>
          </figure>
        ))}
        <figure className="m-0 text-center">
          <div className="h-15 w-22 rounded-ad border border-line-ad bg-bg shadow-none" />
          <figcaption className="tabular mt-1.5 text-[0.625rem] text-fg-muted">
            ad · none
          </figcaption>
        </figure>
      </div>
    </div>
  );
}

/* ── Components ──────────────────────────────────────────────────────────── */

const BUTTON_VARIANTS = ["primary", "secondary", "ghost", "danger"] as const;

function Motif() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>bg-checker — over surface-2, the dropzone&apos;s fill</Label>
        <div className="h-28 rounded-card border border-line bg-surface-2 bg-checker" />
      </div>
      <div>
        <Label>bg-checker — over surface-1, the panel fill</Label>
        <div className="h-28 rounded-card border border-line bg-surface-1 bg-checker" />
      </div>
      <div>
        {/* Side by side so the tile reads as a checkerboard rather than as
            noise. If it reads as noise here, the tile is too small — raise it
            to 20-24px rather than raising the opacity, which would break the
            "never behind text" rule the motif is bound by. */}
        <Label>LoopMark — plain vs personified</Label>
        <div className="flex flex-wrap items-center gap-8 rounded-card border border-line bg-surface-1 p-5 text-mark-muted">
          <LoopMark />
          <LoopMark personified />
        </div>
      </div>
    </div>
  );
}

function Buttons() {
  return (
    <div>
      {BUTTON_VARIANTS.map((variant) => (
        <Row key={variant} name={variant}>
          <Button variant={variant}>Compress GIF</Button>
          <Button variant={variant} forceState="hover">
            hover
          </Button>
          <Button variant={variant} forceState="active">
            active
          </Button>
          <Button variant={variant} forceState="focus">
            focus
          </Button>
          <Button variant={variant} disabled>
            disabled
          </Button>
          {variant === "danger" ? null : (
            <Button variant={variant} loading loadingLabel="Compressing…">
              Compress GIF
            </Button>
          )}
        </Row>
      ))}
      <Row name="sizes">
        <Button size="sm">sm 32</Button>
        <Button size="md">md 40</Button>
        <Button size="lg">lg 48</Button>
      </Row>
      <Row name="xl / mobile bar">
        <Button size="xl">Download</Button>
      </Row>
    </div>
  );
}

function Dropzones() {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>idle (live — try dropping, clicking, or pasting)</Label>
        <Dropzone
          toolSlug="gif-compressor"
          accept={["gif"]}
          className="[&>button]:min-h-38"
        />
      </div>
      <div>
        <Label>hover</Label>
        <Dropzone
          accept={["gif"]}
          forceState="hover"
          className="[&>button]:min-h-38"
        />
      </div>
      <div>
        <Label>focus-visible — ring sits outside the dashed border</Label>
        <Dropzone
          accept={["gif"]}
          forceState="focus"
          className="[&>button]:min-h-38"
        />
      </div>
      <div>
        <Label>drag-over</Label>
        <Dropzone
          accept={["gif"]}
          forceState="dragover"
          className="[&>button]:min-h-38"
        />
      </div>
      <div>
        <Label>invalid file</Label>
        <Dropzone
          toolSlug="gif-compressor"
          accept={["gif"]}
          forceState="invalid"
          className="[&>button]:min-h-38"
        />
      </div>
      <div>
        <Label>loaded — collapses to a chip</Label>
        <div className="flex flex-wrap items-center gap-3">
          <FileChip name="loop-final.gif" size="2.4 MB" />
          <Button variant="ghost" size="sm">
            Choose a different file
          </Button>
        </div>
      </div>
    </div>
  );
}

function FileChips() {
  return (
    <div>
      <Row name="default">
        <FileChip name="loop-final.gif" size="2.4 MB" />
      </Row>
      <Row name="hover">
        <FileChip name="loop-final.gif" size="2.4 MB" forceState="hover" />
      </Row>
      <Row name="focus on ×">
        <FileChip
          name="loop-final.gif"
          size="2.4 MB"
          forceRemoveState="focus"
        />
      </Row>
      <Row name="truncation">
        <FileChip
          name="screen-recording-2026-08-04-final-v3-really-final.gif"
          size="18.6 MB"
        />
      </Row>
      <Row name="error">
        <FileChip name="broken.gif" error="Couldn't read this file" />
      </Row>
    </div>
  );
}

function Controls() {
  return (
    <div className="flex flex-col gap-4">
      <Slider label="Quality" min={1} max={100} defaultValue={80} unit="" />
      <Slider
        label="Quality — hover"
        min={1}
        max={100}
        defaultValue={45}
        forceState="hover"
      />
      <Slider
        label="Quality — focus-visible"
        min={1}
        max={100}
        defaultValue={60}
        forceState="focus"
      />
      <Slider
        label="Quality — disabled"
        min={1}
        max={100}
        defaultValue={30}
        disabled
      />

      <div className="mt-2 flex flex-col gap-2">
        <span className="text-label font-semibold">Colors</span>
        <SelectRoot defaultValue="128">
          <SelectTrigger aria-label="Colors">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="256">256 — best quality</SelectItem>
            <SelectItem value="128">128 — good balance</SelectItem>
            <SelectItem value="64">64 — small file</SelectItem>
            <SelectItem value="32">32 — flat art only</SelectItem>
          </SelectContent>
        </SelectRoot>
      </div>

      <Row name="toggle">
        <SwitchField label="Loop forever" />
        <SwitchField label="Dither" defaultChecked />
        <SwitchField label="hover" forceState="hover" />
        <SwitchField label="focus" defaultChecked forceState="focus" />
        <SwitchField label="disabled" disabled />
      </Row>

      <Row name="preset chip">
        <PresetChip label="Emoji" dimensions="128×128" />
        <PresetChip label="Sticker" dimensions="320×320" forceState="hover" />
        <PresetChip label="Avatar" dimensions="128×128" selected />
        <PresetChip label="Banner" dimensions="—" forceState="focus" />
        <PresetChip label="Lottie" dimensions="n/a" disabled />
      </Row>
    </div>
  );
}

function Progress() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Label>indeterminate — &quot;Preparing…&quot;</Label>
        <ProgressBar determinate={false} label="Preparing" />
      </div>
      <div>
        <Label>determinate 62% + cancel</Label>
        <ProgressBar
          determinate
          value={62}
          label="Compression progress"
          cancel={
            <Button variant="danger" size="sm">
              Cancel
            </Button>
          }
        />
      </div>
      <div>
        <Label>complete</Label>
        <ProgressBar
          determinate
          value={100}
          status="complete"
          label="Compression progress"
        />
      </div>
      <div>
        <Label>error</Label>
        <ProgressBar
          determinate
          value={41}
          status="error"
          label="Compression progress"
        />
        <p className="mt-2 text-sm text-danger-text">
          Compression failed — try lowering Colors to 128.
        </p>
      </div>
    </div>
  );
}

function BeforeAfter() {
  return (
    <div className="flex flex-col gap-4">
      <BeforeAfterSlider
        beforeSrc={BEFORE_FRAME}
        afterSrc={AFTER_FRAME}
        beforeAlt="Original frame, smooth gradient"
        afterAlt="Compressed frame, visible banding"
        beforeLabel="Before · 2.4 MB"
        afterLabel="After · 480 KB"
        aspectRatio={16 / 10}
      />
      <div>
        <Label>fallback — static pair for oversized GIFs</Label>
        <BeforeAfterSlider
          sideBySide
          beforeSrc={BEFORE_FRAME}
          afterSrc={AFTER_FRAME}
          beforeAlt="Original frame, smooth gradient"
          afterAlt="Compressed frame, visible banding"
          beforeLabel="Before · 2.4 MB"
          afterLabel="After · 480 KB"
          aspectRatio={16 / 10}
        />
      </div>
    </div>
  );
}

function Results() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Label>
          empty — reserves the space, and says what will fill it
        </Label>
        <ResultPanel
          empty
          emptyMessage="Your compressed GIF will appear here."
          emptyHint="The preview above shows your GIF while you tune the settings."
          emptyRows={[
            "A before/after slider you can drag across the two versions",
            "The real byte count of the file you are about to download",
            "Which encoder ran, and how many colours it was allowed",
          ]}
        />
      </div>
      <div>
        <Label>complete — check-pop, delta, primary download, next tools</Label>
        <ResultPanel>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <span className="font-sans text-h4 font-semibold">Done</span>
            <Badge variant="neutral">
              <span className="tabular">gifski · q80</span>
            </Badge>
          </div>
          {/* Byte counts rather than formatted strings, because the summary
              derives the delta and the saved figure from them — which is what
              guarantees the badge and the sentence can never disagree. */}
          <ResultSummary
            fromBytes={2_400_000}
            toBytes={480_000}
            savedLine="You just cut {saved} out of it."
            encodedIn="encoded in 4.2s"
            downloadHref="#"
            downloadName="loop-final-compressed.gif"
            downloadLabel="Download GIF"
            next={<NextTools slug="gif-compressor" label="Next?" />}
          >
            <Button variant="secondary">Re-compress</Button>
            <Button variant="ghost">Start over</Button>
          </ResultSummary>
        </ResultPanel>
      </div>
      <div>
        {/* The case the sentence must not claim. Re-encoding an already
            optimised GIF at a higher quality legitimately grows it, and the
            summary drops the "you saved" line rather than printing a negative
            saving — while the badge still says so in words. */}
        <Label>complete — output larger than the input</Label>
        <ResultPanel>
          <ResultSummary
            fromBytes={480_000}
            toBytes={499_200}
            savedLine="You just cut {saved} out of it."
            encodedIn="encoded in 3.8s"
            downloadHref="#"
            downloadName="loop-final-compressed.gif"
            downloadLabel="Download GIF"
          >
            <Button variant="secondary">Re-compress</Button>
          </ResultSummary>
        </ResultPanel>
      </div>
    </div>
  );
}

function Ads() {
  return (
    <div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <div>
          <Label>product card — 16px radius, shadow, hover</Label>
          <div className="flex min-h-63 flex-col justify-center gap-1.5 rounded-card border border-line bg-surface-1 p-4.5 shadow-sm">
            <span className="font-display text-h4 font-medium">
              GIF Compressor
            </span>
            <span className="text-label text-fg-muted">
              Shrink file size with gifski, in your own tab.
            </span>
          </div>
        </div>
        <div>
          <Label>ad slot — 6px radius, flat, no shadow, labelled</Label>
          <AdSlot variant="rect" name="gallery-rect" className="my-0" />
        </div>
      </div>
      <Row name="anchor">
        <AdSlot variant="anchor" name="gallery-anchor" className="my-0" />
      </Row>
      <p className="mt-3 text-sm text-fg-muted">
        The anchor unit is the only permitted sticky ad: mobile only,
        dismissible, and suppressed whenever the sticky action bar is visible.
      </p>
    </div>
  );
}

function Toasts() {
  return (
    <div className="flex flex-col gap-3">
      <ToastCard
        variant="success"
        title="Compressed in 4.2 s"
        description="2.4 MB → 480 KB. Saved 1.9 MB."
      />
      <ToastCard
        variant="error"
        title="Couldn't decode this GIF"
        description="The file may be truncated. Try re-exporting it."
      />
      <ToastCard
        variant="warning"
        title="This file is close to this device's limit"
        description="It may run out of memory partway through."
      />
    </div>
  );
}

const FAQ_ITEMS = [
  {
    id: "open",
    question: "Open item",
    answer:
      "Answer copy sits at 1rem / 1.6, capped at 68ch, and stays in the DOM so crawlers and find-in-page can reach it.",
  },
  {
    id: "closed",
    question: "Closed item",
    answer: "Collapsed, but still in the served HTML.",
  },
  {
    id: "focus",
    question: "Focus-visible item",
    answer: "The ring is inset 2px so it does not clip against the divider.",
  },
] as const;

function Accordions() {
  return (
    <Accordion items={FAQ_ITEMS} defaultOpenId="open" forceFocusId="focus" />
  );
}

function Badges() {
  return (
    <div>
      <Row name="badges">
        <Badge variant="success">−80% smaller</Badge>
        <Badge variant="accent">Instant · in-browser</Badge>
        <Badge variant="warning">Cutting it close</Badge>
        <Badge variant="danger">Too big</Badge>
        <Badge variant="neutral">
          <span className="tabular">640×360 · 20 fps</span>
        </Badge>
      </Row>
      <Row name="trust line">
        <TrustLine />
      </Row>
      <Row name="size delta">
        <SizeDelta from="2.4 MB" to="480 KB" deltaLabel="−80%" />
      </Row>
      <Row name="settings panel">
        <SettingsPanel
          title="Settings"
          description="Every control in one card."
          className="w-full"
        >
          <Slider
            label="Colors"
            min={16}
            max={256}
            step={16}
            defaultValue={128}
          />
        </SettingsPanel>
      </Row>
    </div>
  );
}

function ActionBar() {
  return (
    <StickyActionBar
      alwaysVisible
      meta={
        <>
          <span className="tabular">loop-final.gif</span> · 2.4 MB
        </>
      }
      className="rounded-card border"
    >
      <Button size="xl">Compress GIF</Button>
    </StickyActionBar>
  );
}

function Consent() {
  return (
    <ConsentBar
      message="We use cookies for ads and analytics. You can say no and the tools still work."
      acceptLabel="Accept"
      rejectLabel="Reject"
      manageLabel="Manage"
      className="static rounded-card border"
    />
  );
}
