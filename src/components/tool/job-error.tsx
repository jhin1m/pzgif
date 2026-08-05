"use client";

import { useTranslations } from "next-intl";
import { CircleAlert } from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { messageKeyFor } from "@/lib/media/errors";
import type { AcceptedPlan, MediaError, RecoveryAction } from "@/lib/media/types";
import { getRoute } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * A refusal or a failure, rendered with the way out attached.
 *
 * ── Why the engine hands over codes and this file renders sentences ────────
 * The engine runs in a worker, where next-intl does not exist and should not.
 * So a failure travels as `{ code, params, actions }` and is resolved here. The
 * consequence worth stating: **this component is the only place a user-facing
 * failure string is written**, which is what stops the same problem being
 * described one way on the page and another way in a toast.
 *
 * ── Every failure carries an action, and this renders all of them ──────────
 * `errors.ts` guarantees a recovery action on every code except cancellation.
 * Dropping one here for layout reasons would quietly re-create the dead end the
 * taxonomy exists to prevent — a refusal with nothing to click is a permanent
 * exit for someone who chose the tool, chose a file, and was told no.
 *
 * Two action kinds are deliberately not rendered at MVP:
 *  - `install-fallback-decoder` — the ffmpeg binaries are not vendored into this
 *    deployment, and `plan.ts` already gates the offer on `isFfmpegAvailable()`.
 *    Rendering a button that downloads nothing is worse than the failure.
 *  - `report` — there is no beacon endpoint yet, and a report button that
 *    silently discards the report is a lie with a nicer surface.
 */

/**
 * Defaults for every interpolation any message uses.
 *
 * `errors.ts` omits parameters it cannot honestly supply — `frames` is left out
 * when the container never stated a duration — and next-intl throws on a missing
 * one. Merging defaults underneath means an omitted number renders as an em dash
 * instead of taking the whole page down with it.
 */
const PARAM_DEFAULTS = {
  format: "—",
  frames: "—",
  budgetMb: "—",
  colours: 128,
  width: 320,
  reason: "",
} as const;

type ChangeableSetting = Extract<
  RecoveryAction,
  { kind: "change-setting" }
>["setting"];

export function JobError({
  error,
  onRunDegraded,
  settings,
  onChangeSetting,
  className,
}: {
  error: MediaError;
  /** Runs the plan the refusal offered, verbatim. */
  onRunDegraded?: (plan: AcceptedPlan) => void;
  /**
   * The settings this tool actually exposes a control for.
   *
   * `errors.ts` offers `colours`, `width`, `fps` and `frames`; no tool has all
   * four. Without this, a page that handles two of them still renders buttons
   * for the other two, and clicking one does nothing — the same defect as a
   * slider with no lever behind it, in the one component whose whole purpose is
   * that a failure is never a dead end.
   */
  settings?: readonly ChangeableSetting[];
  /** Applies a suggested setting and leaves the run to the user. */
  onChangeSetting?: (setting: ChangeableSetting, value: number) => void;
  className?: string;
}) {
  const t = useTranslations();
  const values = { ...PARAM_DEFAULTS, ...error.params };

  return (
    <div
      // `alert`, not `status`: a refusal stops the thing the user just asked
      // for, and a polite announcement can arrive after they have moved on.
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-card border border-danger bg-danger-subtle p-5",
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <CircleAlert
          aria-hidden="true"
          className="mt-0.5 size-5 flex-none text-danger"
        />
        <p className="text-body text-danger-text">
          {t(messageKeyFor(error), values)}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {error.actions.map((action, index) => (
          <RecoveryButton
            key={index}
            action={action}
            onRunDegraded={onRunDegraded}
            settings={settings}
            onChangeSetting={onChangeSetting}
          />
        ))}
      </div>
    </div>
  );
}

function RecoveryButton({
  action,
  onRunDegraded,
  settings,
  onChangeSetting,
}: {
  action: RecoveryAction;
  onRunDegraded?: (plan: AcceptedPlan) => void;
  settings?: readonly ChangeableSetting[];
  onChangeSetting?: (setting: ChangeableSetting, value: number) => void;
}) {
  const t = useTranslations("engine.actions");

  switch (action.kind) {
    case "use-tool": {
      const route = getRoute(action.slug);
      // A suggestion that names an unbuilt page is the dead end this whole
      // taxonomy exists to prevent, so an unshipped route is simply not offered.
      if (!route || route.status !== "live") return null;
      return (
        // A link, not a button: it navigates. `buttonVariants` rather than
        // `<Button>` because `Button` renders a real `<button>` by design — §5.1
        // has no `asChild`, and a button that navigates loses middle-click,
        // open-in-new-tab and the status-bar preview.
        <Link
          href={`/${route.slug}`}
          className={buttonVariants({ variant: "secondary", size: "sm" })}
        >
          {t("useTool", { tool: route.name })}
        </Link>
      );
    }

    case "run-degraded": {
      if (!onRunDegraded) return null;
      const { plan } = action;
      return (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onRunDegraded(plan)}
        >
          {t("runDegraded", {
            width: plan.width,
            fps: plan.fps,
            seconds: +(plan.frames / plan.fps).toFixed(1),
          })}
        </Button>
      );
    }

    case "change-setting": {
      // Not offered unless this tool can actually apply it.
      if (!onChangeSetting || !settings?.includes(action.setting)) return null;
      const labels = {
        colours: "changeColours",
        width: "changeWidth",
        fps: "changeFps",
        frames: "changeFrames",
      } as const;
      return (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onChangeSetting(action.setting, action.value)}
        >
          {t(labels[action.setting], { value: action.value })}
        </Button>
      );
    }

    case "try-other-browser":
      // Advice, not an action: there is nothing here for the page to do, and a
      // button that cannot act is worse than a sentence that informs.
      return (
        <p className="text-caption text-fg-secondary">{t("tryOtherBrowser")}</p>
      );

    default:
      return null;
  }
}
