import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "This one cannot run here" — the intake region on a device that will refuse.
 *
 * ── Why this is a designed state and not a thrown error ────────────────────
 * `plan.md` obliges Phase 5 onward to carry a per-tool availability state with
 * copy of its own, and Phase 7 to put it on `mp4-to-gif` above the fold. Gate G8
 * measured an 80% refusal rate for video input on the iOS budget: every video
 * shape fails. Letting an iPhone visitor choose a clip and then refusing it is a
 * broken tool with extra steps, and a refused job with no explanation is
 * indistinguishable from one that is simply broken.
 *
 * ── It fills the dropzone's box exactly ────────────────────────────────────
 * `GifWorkbench` renders this *instead of* the dropzone inside a fixed-height
 * container, and the device is only knowable after hydration. If this were any
 * other height, every iOS visitor would see the page jump as it mounted.
 *
 * Every word is passed in. There is no fallback string here, because "not
 * supported" is exactly the sentence this state exists to replace.
 */
export function ToolUnavailable({
  title,
  body,
  action,
  className,
}: {
  title: string;
  /** Why, in this tool's own terms. Hand-written. */
  body: string;
  /** Something to do instead — a link to a tool that does work here. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      data-tool-unavailable
      className={cn(
        "flex min-h-0 flex-1 flex-col items-center justify-center gap-2 rounded-card px-6 text-center",
        "border border-dashed border-line bg-surface-2",
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="size-6 text-fg-muted" />
      <p className="font-sans text-h4 font-semibold text-fg">{title}</p>
      <p className="max-w-prose text-caption text-fg-secondary">{body}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
