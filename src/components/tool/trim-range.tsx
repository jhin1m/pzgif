"use client";

import { useCallback, useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The two-handle trim over a clip's duration — `phase-07`'s one bespoke control.
 *
 * ── Why it is not two `<Slider>`s ──────────────────────────────────────────
 * Two range inputs stacked on one track is the usual shortcut and it breaks in
 * the two places that matter. The handles overlap, so at the crossing point the
 * pointer picks whichever input is later in the DOM rather than the one nearer
 * the cursor; and each input announces its own min/max, so a screen-reader user
 * hears "0 to 10" twice and never hears that the two are bounded by each other.
 * Both handles here are `role="slider"` elements whose `aria-valuemin`/`max`
 * track the *other* handle, which is the fact that actually constrains them.
 *
 * ── Keyboard is the primary path, not the fallback ─────────────────────────
 * §7.3 forbids a drag-only control. ←/→ move by `stepSec`, Shift by one second,
 * Home/End jump to the handle's own bound. The numeric second inputs beside the
 * track are the third route, for someone who already knows the timecode — and
 * they commit on blur or Enter for the same reason `crop-fields.tsx` does:
 * clamping mid-keystroke makes "12" impossible to type when the floor is 1.
 *
 * ── Nothing here is prose ──────────────────────────────────────────────────
 * The group label and the hint arrive from the page's content file. What this
 * file names — "Start", "End", the selected-duration readout — is chrome that is
 * genuinely the same wherever a trim exists, so it lives in the catalogue.
 */

export interface TrimValue {
  /** Seconds from the start of the clip. */
  from: number;
  /** Seconds from the start of the clip. Always `>= from`. */
  to: number;
}

/**
 * Arrow-key granularity, and it is tied to the readout's precision on purpose.
 *
 * A finer step is not better here. The numeric fields show one decimal, so a
 * 0.05 s step moved the value without moving the number beside it — a keypress
 * that appears to do nothing, which reads as a broken control rather than as a
 * precise one. Anyone who needs a finer cut than a tenth of a second types it.
 */
const STEP_SEC = 0.1;
/** Shift-arrow granularity, and what the numeric inputs step by. */
const COARSE_STEP_SEC = 1;
/**
 * The shortest trim the control will produce.
 *
 * Not zero: a zero-length selection decodes no frames, and gifski refuses fewer
 * than two outright — so the handles would be allowed to reach a state whose
 * only possible outcome is a failed job.
 */
const MIN_SPAN_SEC = 0.1;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

/** To the tenth of a second the readout shows, without float noise. */
function quantise(seconds: number): number {
  return Math.round(seconds * 10) / 10;
}

/** One decimal, always shown, so the readout cannot change width as it moves. */
export function formatSeconds(seconds: number): string {
  return `${seconds.toFixed(1)}s`;
}

export function TrimRange({
  durationSec,
  value,
  onChange,
  disabled = false,
  label,
}: {
  /** The clip's full length. The track's right-hand bound. */
  durationSec: number;
  value: TrimValue;
  onChange(next: TrimValue): void;
  disabled?: boolean;
  /** The group label. Hand-written per tool. */
  label: string;
}) {
  const t = useTranslations("trim");
  const groupId = useId();
  const trackRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ handle: "from" | "to"; value: string } | null>(
    null,
  );
  /** Which handle a pointer is currently dragging, or null. */
  const [dragging, setDragging] = useState<"from" | "to" | null>(null);

  const span = Math.max(durationSec, MIN_SPAN_SEC);

  const set = useCallback(
    (handle: "from" | "to", seconds: number) => {
      // Each handle is bounded by the other, never by the track alone. Letting
      // them cross would produce a negative span that every consumer downstream
      // would have to defend against separately.
      const next =
        handle === "from"
          ? { from: clamp(seconds, 0, value.to - MIN_SPAN_SEC), to: value.to }
          : { from: value.from, to: clamp(seconds, value.from + MIN_SPAN_SEC, span) };
      // Snapped to the readout's own precision, so a drag and a keypress cannot
      // leave the value at a precision the display rounds away. Multiplying by
      // ten rather than dividing by `STEP_SEC` keeps the result a clean tenth
      // instead of a float artefact like 0.30000000000000004, which would reach
      // the engine as the trim.
      onChange({ from: quantise(next.from), to: quantise(next.to) });
    },
    [onChange, span, value.from, value.to],
  );

  const secondsAt = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return 0;
      const rect = track.getBoundingClientRect();
      if (rect.width === 0) return 0;
      return ((clientX - rect.left) / rect.width) * span;
    },
    [span],
  );

  const onHandleKeyDown = useCallback(
    (handle: "from" | "to", event: React.KeyboardEvent) => {
      const step = event.shiftKey ? COARSE_STEP_SEC : STEP_SEC;
      const current = handle === "from" ? value.from : value.to;

      switch (event.key) {
        case "ArrowLeft":
        case "ArrowDown":
          set(handle, current - step);
          break;
        case "ArrowRight":
        case "ArrowUp":
          set(handle, current + step);
          break;
        case "PageDown":
          set(handle, current - COARSE_STEP_SEC);
          break;
        case "PageUp":
          set(handle, current + COARSE_STEP_SEC);
          break;
        case "Home":
          set(handle, handle === "from" ? 0 : value.from);
          break;
        case "End":
          set(handle, handle === "from" ? value.to : span);
          break;
        default:
          return;
      }
      // Only after a key that did something: swallowing every keystroke would
      // eat Tab and trap focus on the handle.
      event.preventDefault();
    },
    [set, span, value.from, value.to],
  );

  const startDrag = useCallback(
    (handle: "from" | "to", event: React.PointerEvent) => {
      if (disabled) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragging(handle);
    },
    [disabled],
  );

  const commitField = useCallback(
    (handle: "from" | "to", raw: string) => {
      setDraft(null);
      const parsed = Number(raw);
      if (!Number.isFinite(parsed)) return;
      set(handle, parsed);
    },
    [set],
  );

  const percent = (seconds: number) => `${(seconds / span) * 100}%`;
  const selected = Math.max(0, value.to - value.from);

  const handleProps = (handle: "from" | "to") => {
    const current = handle === "from" ? value.from : value.to;
    return {
      role: "slider" as const,
      tabIndex: disabled ? -1 : 0,
      "aria-label": t(handle === "from" ? "startHandle" : "endHandle"),
      "aria-valuemin": handle === "from" ? 0 : +(value.from + MIN_SPAN_SEC).toFixed(2),
      "aria-valuemax": handle === "from" ? +(value.to - MIN_SPAN_SEC).toFixed(2) : +span.toFixed(2),
      "aria-valuenow": +current.toFixed(2),
      "aria-valuetext": formatSeconds(current),
      "aria-disabled": disabled || undefined,
      "aria-describedby": groupId,
      "data-trim-handle": handle,
      onKeyDown: (event: React.KeyboardEvent) => {
        if (disabled) return;
        onHandleKeyDown(handle, event);
      },
      onPointerDown: (event: React.PointerEvent) => startDrag(handle, event),
      style: { left: percent(current) },
      className: cn(
        // 44px hit area via padding on a 16px visual dot: §7.2's target size
        // without a 44px circle sitting on a 6px track.
        "absolute top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 touch-none",
        // No focus class: `globals.css` gives every `:focus-visible` element the
        // project ring, and the 44px box is the right thing for it to frame.
        "grid place-items-center rounded-full",
        disabled ? "cursor-not-allowed" : "cursor-ew-resize",
      ),
    };
  };

  return (
    <div className="flex flex-col gap-3" data-trim-range>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span id={groupId} className="text-label font-semibold text-fg">
          {label}
        </span>
        <span className="tabular text-caption text-fg-secondary" data-trim-duration>
          {t("selected", { seconds: selected.toFixed(1) })}
        </span>
      </div>

      <div
        ref={trackRef}
        className="relative h-11 touch-none select-none"
        onPointerMove={(event) => {
          if (!dragging || disabled) return;
          set(dragging, secondsAt(event.clientX));
        }}
        onPointerUp={() => setDragging(null)}
        onPointerCancel={() => setDragging(null)}
      >
        {/* The track itself, centred in the 44px row. */}
        <div
          className={cn(
            "absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-pill",
            disabled ? "bg-surface-disabled" : "bg-line",
          )}
        />
        <div
          aria-hidden="true"
          className={cn(
            "absolute top-1/2 h-1.5 -translate-y-1/2 rounded-pill",
            disabled ? "bg-fg-disabled" : "bg-brand-fill",
          )}
          style={{ left: percent(value.from), width: percent(selected) }}
        />
        <div {...handleProps("from")}>
          <span
            aria-hidden="true"
            className={cn(
              "size-4.5 rounded-full border-2 border-surface-1 shadow-sm",
              disabled ? "bg-fg-disabled" : "bg-brand-fill",
            )}
          />
        </div>
        <div {...handleProps("to")}>
          <span
            aria-hidden="true"
            className={cn(
              "size-4.5 rounded-full border-2 border-surface-1 shadow-sm",
              disabled ? "bg-fg-disabled" : "bg-brand-fill",
            )}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {(["from", "to"] as const).map((handle) => (
          <label key={handle} className="flex flex-col gap-1">
            <span className="text-caption text-fg-muted">
              {t(handle === "from" ? "start" : "end")}
            </span>
            <input
              type="number"
              inputMode="decimal"
              data-trim-field={handle}
              className={cn(
                "tabular w-full rounded-control border border-line-control bg-surface-1 px-2 py-1.5 text-sm",
                "disabled:bg-surface-2 disabled:text-fg-disabled",
              )}
              min={0}
              max={span}
              step={COARSE_STEP_SEC}
              disabled={disabled}
              value={
                draft?.handle === handle
                  ? draft.value
                  : (handle === "from" ? value.from : value.to).toFixed(1)
              }
              onChange={(event) => setDraft({ handle, value: event.target.value })}
              onBlur={(event) => commitField(handle, event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                commitField(handle, event.currentTarget.value);
              }}
            />
          </label>
        ))}
      </div>
    </div>
  );
}
