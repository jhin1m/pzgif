"use client";

/* eslint-disable @next/next/no-img-element -- The source is a `blob:` URL made
   inside the tab; `next/image` would route it through the image optimiser. */

import { useCallback, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { CropRect } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import {
  CROP_HANDLES,
  moveCropRect,
  resizeCropRect,
  type CropHandle,
} from "./crop-rect";

/**
 * The draggable crop rectangle, over the first frame.
 *
 * ── Three input methods, one rectangle ─────────────────────────────────────
 * `design-guidelines.md` §7.3 forbids a drag-only path, and the usual way that
 * rule is met — pointer first, keyboard bolted on later — produces a control
 * where the two disagree about rounding. So all three routes (drag, arrow keys,
 * and the number inputs in the settings panel) call the same functions in
 * `crop-rect.ts` and none of them owns the state: this component is controlled,
 * and the page holds the rectangle.
 *
 * ── Why the geometry is in percent ─────────────────────────────────────────
 * The rectangle is positioned as a percentage of the *source* dimensions, so it
 * needs no measurement to render and it survives a resize, a zoom and an
 * orientation change without a `ResizeObserver`. Only the pointer maths needs
 * the displayed size, and that is read at event time from the element the image
 * actually occupies — not from the letterboxed box around it, which is where
 * `object-contain` overlays usually go wrong by a few percent.
 *
 * ── Why the preview is a still ─────────────────────────────────────────────
 * A cropping decision is made against one frame, and an animation moving under
 * a rectangle is harder to place, not easier — so the still is the default and
 * the animation is opt-in, per §7.4's reduced-motion rule. The caller supplies
 * both, because decoding the first frame belongs to the page that owns the file.
 */

export interface CropOverlayProps {
  /** A still of the first frame. Falls back to `animatedSrc` when absent. */
  stillSrc: string | null;
  /** The source GIF itself, shown while "Play preview" is on. */
  animatedSrc: string;
  playing?: boolean;
  alt: string;
  sourceWidth: number;
  sourceHeight: number;
  rect: CropRect;
  onChange(rect: CropRect): void;
  /** Held ratio (width ÷ height), or null for a free crop. */
  aspect: number | null;
  disabled?: boolean;
}

interface DragState {
  handle: CropHandle | "move";
  pointerId: number;
  startX: number;
  startY: number;
  startRect: CropRect;
  /** Source pixels per CSS pixel, fixed at gesture start. */
  scaleX: number;
  scaleY: number;
}

const HANDLE_POSITION: Record<CropHandle, string> = {
  nw: "left-0 top-0 -translate-x-1/2 -translate-y-1/2 cursor-nwse-resize",
  n: "left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize",
  ne: "right-0 top-0 translate-x-1/2 -translate-y-1/2 cursor-nesw-resize",
  e: "right-0 top-1/2 translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
  se: "right-0 bottom-0 translate-x-1/2 translate-y-1/2 cursor-nwse-resize",
  s: "left-1/2 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-ns-resize",
  sw: "left-0 bottom-0 -translate-x-1/2 translate-y-1/2 cursor-nesw-resize",
  w: "left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize",
};

export function CropOverlay({
  stillSrc,
  animatedSrc,
  playing = false,
  alt,
  sourceWidth,
  sourceHeight,
  rect,
  onChange,
  aspect,
  disabled = false,
}: CropOverlayProps) {
  const t = useTranslations("crop");
  const frameRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);

  const bounds = { width: sourceWidth, height: sourceHeight };

  const beginDrag = useCallback(
    (event: React.PointerEvent, handle: CropHandle | "move") => {
      if (disabled) return;
      const frame = frameRef.current;
      if (!frame) return;
      const box = frame.getBoundingClientRect();
      if (box.width === 0 || box.height === 0) return;

      event.preventDefault();
      event.stopPropagation();
      (event.target as Element).setPointerCapture(event.pointerId);
      dragRef.current = {
        handle,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startRect: rect,
        scaleX: sourceWidth / box.width,
        scaleY: sourceHeight / box.height,
      };
      setDragging(true);
    },
    [disabled, rect, sourceHeight, sourceWidth],
  );

  const continueDrag = useCallback(
    (event: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const dx = (event.clientX - drag.startX) * drag.scaleX;
      const dy = (event.clientY - drag.startY) * drag.scaleY;

      onChange(
        drag.handle === "move"
          ? moveCropRect(drag.startRect, dx, dy, bounds)
          : resizeCropRect(drag.startRect, drag.handle, dx, dy, bounds, aspect),
      );
    },
    // `bounds` is rebuilt every render from two numbers; depending on those two
    // rather than the object keeps this callback stable between renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aspect, onChange, sourceHeight, sourceWidth],
  );

  const endDrag = useCallback((event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    (event.target as Element).releasePointerCapture?.(event.pointerId);
    dragRef.current = null;
    setDragging(false);
  }, []);

  /**
   * Arrow keys, on the rectangle and on every handle.
   *
   * 1px by default and 10px with Shift, matching the number inputs' step. This
   * is not a courtesy path: it is the only way to place a crop to the pixel, and
   * pointer users reach for it too.
   */
  const keyNudge = useCallback(
    (event: React.KeyboardEvent, handle: CropHandle | "move") => {
      if (disabled) return;
      const step = event.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      switch (event.key) {
        case "ArrowLeft":
          dx = -step;
          break;
        case "ArrowRight":
          dx = step;
          break;
        case "ArrowUp":
          dy = -step;
          break;
        case "ArrowDown":
          dy = step;
          break;
        default:
          return;
      }
      event.preventDefault();
      onChange(
        handle === "move"
          ? moveCropRect(rect, dx, dy, bounds)
          : resizeCropRect(rect, handle, dx, dy, bounds, aspect),
      );
    },
    // Same reasoning as `continueDrag`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [aspect, disabled, onChange, rect, sourceHeight, sourceWidth],
  );

  const percent = {
    left: `${(rect.x / sourceWidth) * 100}%`,
    top: `${(rect.y / sourceHeight) * 100}%`,
    width: `${(rect.width / sourceWidth) * 100}%`,
    height: `${(rect.height / sourceHeight) * 100}%`,
  };

  const readout = t("readout", {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });

  return (
    <div className="flex size-full items-center justify-center">
      <div
        ref={frameRef}
        // Shrink-wraps the image so the overlay's percentages are percentages of
        // the *painted* pixels. Sizing this to the letterboxed container instead
        // is the classic `object-contain` overlay bug.
        className="relative max-h-full max-w-full"
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <img
          src={playing || !stillSrc ? animatedSrc : stillSrc}
          alt={alt}
          draggable={false}
          className="block max-h-full max-w-full select-none object-contain"
        />

        {/* Dimmed outside, clear inside — four bars rather than a box-shadow so
            the clear region is genuinely unfiltered at any zoom. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0">
          <div className="absolute inset-x-0 top-0 bg-overlay" style={{ height: percent.top }} />
          <div
            className="absolute inset-x-0 bottom-0 bg-overlay"
            style={{ top: `calc(${percent.top} + ${percent.height})` }}
          />
          <div
            className="absolute left-0 bg-overlay"
            style={{ top: percent.top, height: percent.height, width: percent.left }}
          />
          <div
            className="absolute right-0 bg-overlay"
            style={{
              top: percent.top,
              height: percent.height,
              left: `calc(${percent.left} + ${percent.width})`,
            }}
          />
        </div>

        <div
          className={cn(
            "absolute border-2 border-bg outline outline-1 outline-fg/60",
            disabled && "opacity-60",
          )}
          style={percent}
        >
          {/* The move target sits under the handles in DOM order so a handle
              always wins the pointer. */}
          <div
            role="button"
            tabIndex={disabled ? -1 : 0}
            aria-label={t("moveLabel")}
            aria-describedby="crop-readout"
            data-crop-move=""
            className={cn(
              "absolute inset-0 touch-none",
              disabled ? "cursor-not-allowed" : dragging ? "cursor-grabbing" : "cursor-grab",
            )}
            onPointerDown={(event) => beginDrag(event, "move")}
            onKeyDown={(event) => keyNudge(event, "move")}
          />

          {CROP_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              disabled={disabled}
              data-crop-handle={handle}
              aria-label={t(`handles.${handle}`)}
              aria-describedby="crop-readout"
              className={cn(
                "absolute size-4 touch-none rounded-xs border border-fg/70 bg-bg shadow-sm",
                // 44px hit area without a 44px dot: the pseudo-element is the
                // target, the square is the affordance (§7.3).
                "before:absolute before:-inset-3.5 before:content-['']",
                "focus-visible:outline-offset-2 disabled:cursor-not-allowed",
                HANDLE_POSITION[handle],
              )}
              onPointerDown={(event) => beginDrag(event, handle)}
              onKeyDown={(event) => keyNudge(event, handle)}
            />
          ))}
        </div>

        <p
          id="crop-readout"
          aria-live="polite"
          className={cn(
            "tabular absolute bottom-2 left-1/2 -translate-x-1/2 rounded-control",
            "bg-bg/90 px-2.5 py-1 text-caption text-fg shadow-sm",
          )}
        >
          {readout}
        </p>
      </div>
    </div>
  );
}
