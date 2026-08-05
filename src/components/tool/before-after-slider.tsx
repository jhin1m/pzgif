"use client";

/* eslint-disable @next/next/no-img-element -- The sources here are `blob:` URLs
   produced inside the tab. `next/image` cannot optimise a file that never had a
   URL on the network, its wrapper element would fight the `clip-path` this
   component is built on, and the loader would try to fetch a blob through the
   image optimiser. A plain <img> is correct for this component and only this
   component. */

import { useCallback, useRef, useState } from "react";
import { MoveHorizontal } from "lucide-react";
import { detectTier, TIER_BUDGETS, type DeviceTier } from "@/lib/media/limits";
import { cn } from "@/lib/utils";

/**
 * BeforeAfterSlider — docs/design-guidelines.md §5.8.
 *
 * This is the proof surface for differentiator #1. Design principle #4 says
 * *prove the quality, don't claim it*, and this is the component that does it —
 * so any lag destroys the exact moment it exists to create. Hence:
 *
 *  - the divider is pointer-tracked with `setPointerCapture` and has **no
 *    transition on position**; only the handle's hover scale is animated,
 *  - `touch-action: none` on the frame, so a horizontal drag never turns into a
 *    page scroll on the way,
 *  - the clip is `clip-path: inset()` rather than a width — a width change
 *    would relayout the image on every pointer move.
 *
 * ── Keyboard is not a courtesy here (§5.8, §7.3) ────────────────────────────
 * ← / → 1%, Shift + ← / → 10%, Home / End, and Enter for an A-B flip, which is
 * the fastest way to see the difference without dragging at all.
 *
 * ── The fallback, and what its threshold is actually based on ───────────────
 * §5.8 requires a static side-by-side pair instead of a laggy divider on very
 * large GIFs, and leaves the threshold open pending measurement. See
 * `shouldRenderSideBySide()` below for the rule and its provenance.
 */

/**
 * Whether the comparison must degrade to a static pair.
 *
 * Two animated layers are decoded and composited simultaneously here, so the
 * cost scales with `frames × width × height`, exactly like the encoder's frame
 * buffer — which is the one quantity Phase 1 measured. The budget is a quarter
 * of the device tier's frame-buffer allowance, divided by the 8 bytes each pixel
 * costs across two RGBA layers.
 *
 * **This is provisional.** Phase 1 measured decode and encode throughput, not
 * browser compositing, so the shape of the rule is grounded and the constant is
 * not. Phase 11 re-measures it on a real device; until then the failure mode is
 * a conservative one — a static pair that could have been a slider, rather than
 * a slider that stutters. `design-guidelines.md` §Open 2 tracks it.
 */
export function shouldRenderSideBySide(input: {
  frames: number;
  width: number;
  height: number;
  tier?: DeviceTier;
}): boolean {
  const tier = input.tier ?? detectTier();
  const budgetPixels = TIER_BUDGETS[tier].budgetBytes / 32;
  return input.frames * input.width * input.height > budgetPixels;
}

export interface BeforeAfterSliderProps {
  beforeSrc: string;
  afterSrc: string;
  /** "Before · 2.4 MB" — the caller formats the bytes; §5.8 requires real ones. */
  beforeLabel: string;
  afterLabel: string;
  beforeAlt: string;
  afterAlt: string;
  /** Reserves the frame before either image decodes, so nothing shifts. */
  aspectRatio?: number;
  /** Forces the static pair. Compute it with `shouldRenderSideBySide()`. */
  sideBySide?: boolean;
  className?: string;
  /** Screenshot support for /dev/states. Never set this in product code. */
  forceHandleState?: "hover" | "focus";
}

export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeLabel,
  afterLabel,
  beforeAlt,
  afterAlt,
  aspectRatio = 4 / 3,
  sideBySide = false,
  className,
  forceHandleState,
}: BeforeAfterSliderProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const [dragging, setDragging] = useState(false);

  const positionFromPointer = useCallback((clientX: number) => {
    const frame = frameRef.current;
    if (!frame) return null;
    const rect = frame.getBoundingClientRect();
    if (rect.width === 0) return null;
    return Math.min(
      100,
      Math.max(0, ((clientX - rect.left) / rect.width) * 100),
    );
  }, []);

  if (sideBySide) {
    return (
      <div className={cn("grid grid-cols-2 gap-2", className)}>
        <Pane
          src={beforeSrc}
          alt={beforeAlt}
          label={beforeLabel}
          ratio={aspectRatio}
        />
        <Pane
          src={afterSrc}
          alt={afterAlt}
          label={afterLabel}
          ratio={aspectRatio}
        />
      </div>
    );
  }

  const move = (clientX: number) => {
    const next = positionFromPointer(clientX);
    if (next !== null) setPosition(next);
  };

  const nudge = (delta: number) =>
    setPosition((current) => Math.min(100, Math.max(0, current + delta)));

  return (
    <div
      ref={frameRef}
      style={
        {
          "--pos": `${position}%`,
          aspectRatio: `${aspectRatio}`,
        } as React.CSSProperties
      }
      className={cn(
        "relative w-full touch-none select-none overflow-hidden",
        "rounded-card border border-line bg-surface-2",
        className,
      )}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        move(event.clientX);
      }}
      onPointerMove={(event) => {
        if (dragging) move(event.clientX);
      }}
      onPointerUp={(event) => {
        event.currentTarget.releasePointerCapture(event.pointerId);
        setDragging(false);
      }}
      onPointerCancel={() => setDragging(false)}
    >
      <img
        src={beforeSrc}
        alt={beforeAlt}
        className="absolute inset-0 size-full object-cover"
      />
      <img
        src={afterSrc}
        alt={afterAlt}
        className="absolute inset-0 size-full object-cover"
        style={{ clipPath: "inset(0 0 0 var(--pos))" }}
      />

      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 left-[var(--pos)] w-0.5 bg-bg shadow-[0_0_0_1px_oklch(0%_0_0/0.25)]"
      />

      <Tag className="left-2.5">{beforeLabel}</Tag>
      <Tag className="right-2.5">{afterLabel}</Tag>

      <div
        role="slider"
        tabIndex={0}
        aria-label="Compare before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(position)}
        aria-valuetext={`After image ${Math.round(100 - position)}% visible`}
        data-force={forceHandleState}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          switch (event.key) {
            case "ArrowLeft":
              nudge(-step);
              break;
            case "ArrowRight":
              nudge(step);
              break;
            case "Home":
              setPosition(0);
              break;
            case "End":
              setPosition(100);
              break;
            case "Enter":
              // A-B flip: the fastest way to see a difference is to swap between
              // the two extremes, not to inch a divider across the frame.
              setPosition((current) => (current > 50 ? 0 : 100));
              break;
            default:
              return;
          }
          event.preventDefault();
        }}
        className={cn(
          "absolute left-[var(--pos)] top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2",
          "cursor-ew-resize place-items-center rounded-full",
          "border border-line-control bg-bg text-fg shadow-md",
          // Scale only, and only when not dragging: the position itself is never
          // animated (§5.8).
          "transition-transform duration-[120ms] ease-out motion-reduce:transition-none",
          "hover:scale-106 data-[force=hover]:scale-106 motion-reduce:hover:scale-100",
          "focus-visible:outline-offset-[3px]",
          forceHandleState === "focus" && "force-focus",
        )}
      >
        <MoveHorizontal className="size-4" aria-hidden="true" />
      </div>
    </div>
  );
}

function Pane({
  src,
  alt,
  label,
  ratio,
}: {
  src: string;
  alt: string;
  label: string;
  ratio: number;
}) {
  return (
    <div
      style={{ aspectRatio: `${ratio}` }}
      className="relative overflow-hidden rounded-card border border-line bg-surface-2"
    >
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 size-full object-cover"
      />
      <Tag className="left-2.5">{label}</Tag>
    </div>
  );
}

/**
 * The corner plate, kept legible over any frame (§5.8).
 *
 * The one place in the library that reaches for a primitive rather than a
 * semantic token, and deliberately: this plate sits on top of *image* content,
 * not on a page surface, so it must stay dark-on-light regardless of theme. A
 * themed plate would vanish over half the frames it is meant to label.
 */
function Tag({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute bottom-2.5 rounded-xs px-2.5 py-1",
        "bg-neutral-950/70 text-micro font-semibold uppercase text-white",
        className,
      )}
    >
      {children}
    </span>
  );
}
