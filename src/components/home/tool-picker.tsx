"use client";

import { ArrowRight } from "lucide-react";
import { toolIcon } from "@/components/home/tool-icons";
import { Link } from "@/i18n/navigation";
import type { ToolDefinition } from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * The action picker: the file is in, now what should happen to it.
 *
 * ── Why the drop does not navigate on its own ──────────────────────────────
 * The wireframe promised "we pick the right tool for your file". It cannot.
 * `sniff.ts` decides what the *bytes* are and says nothing about *intent*, and
 * every live route declares `inputFormats: ["gif"]` — so a dropped GIF is valid
 * input for all five, and auto-routing would guess wrong four times in five.
 *
 * ezgif makes you choose the tool before it will take the file. This takes the
 * file first and asks second, which is the whole difference and costs one small
 * module.
 *
 * ── The chips are links, and that is not a detail ──────────────────────────
 * Middle-click, ⌘-click, "copy link address" and the keyboard all work because
 * this is an anchor and not a div with a handler. The click *also* hands the
 * file over — see `onPick` — but the navigation is the browser's, so a failure
 * anywhere in the handoff leaves the visitor on the tool page with their own
 * dropzone rather than nowhere.
 */

export function ToolPicker({
  heading,
  routes,
  onPick,
  className,
}: {
  heading: string;
  /** Live routes that accept the sniffed format. Never a `planned` route. */
  routes: readonly ToolDefinition[];
  /** Stashes the file for the named page about to mount. */
  onPick: (slug: string) => void;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-label font-semibold text-fg-secondary">{heading}</h2>
      <ul className="mt-2.5 flex flex-wrap gap-2.5">
        {routes.map((route) => {
          const Icon = toolIcon(route.slug);
          return (
            <li key={route.slug}>
              <Link
                href={`/${route.slug}`}
                // Named, so a ⌘-click that arms the handoff without navigating
                // cannot have its file collected by a different tool later.
                onClick={() => onPick(route.slug)}
                className={cn(
                  // 44px, because on a phone this row is the whole interface.
                  "group inline-flex min-h-11 items-center gap-2 rounded-pill px-4",
                  "border border-line bg-surface-1 text-label font-medium text-fg",
                  "transition-colors duration-[120ms] ease-out",
                  "hover:border-brand hover:bg-brand-subtle",
                )}
              >
                <Icon aria-hidden="true" className="size-4 text-brand" />
                {route.name}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 text-fg-muted"
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
