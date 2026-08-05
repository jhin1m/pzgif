"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { BrandMark, Wordmark } from "@/components/brand/marks";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Link } from "@/i18n/navigation";
import {
  PRESET_ROUTES,
  TOOL_GROUP_ORDER,
  routesInGroup,
  type ToolGroup,
} from "@/lib/tools/registry";
import { cn } from "@/lib/utils";

/**
 * Header — docs/design-guidelines.md §4.4 (56px, z-10) and §9 (the ≡ menu
 * expands to inline links at `lg`).
 *
 * Every link resolves through `src/lib/tools/registry.ts`, so a tool cannot
 * exist in the nav and not in the footer, or vice versa. The shortlist below is
 * a slice of that list, never a second copy of it.
 *
 * The height is fixed at 56px in both states — the mobile menu opens *under* the
 * bar rather than growing it, because a sticky element that changes height
 * pushes the page content it is sitting on.
 */

const NAV_GROUPS: readonly ToolGroup[] = TOOL_GROUP_ORDER;

export function SiteHeader() {
  const t = useTranslations("nav");
  const [menuOpen, setMenuOpen] = useState(false);

  const primaryLinks = [...routesInGroup("edit").slice(0, 3), PRESET_ROUTES[0]];

  return (
    <header
      className={cn(
        "sticky top-0 z-[var(--z-header)] h-14 border-b border-line",
        "bg-bg/90 backdrop-blur-[8px]",
      )}
    >
      <div
        className="mx-auto flex h-full max-w-[1280px] items-center gap-4 px-4 sm:px-6"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuOpen) setMenuOpen(false);
        }}
      >
        <Link href="/" className="inline-flex items-center gap-2 no-underline">
          <BrandMark />
          <Wordmark />
        </Link>

        <nav aria-label={t("tools")} className="ms-auto hidden gap-1 lg:flex">
          {primaryLinks.map((route) => (
            <Link
              key={route.slug}
              href={`/${route.slug}`}
              className={cn(
                "rounded-control px-2.5 py-2 text-sm font-medium text-fg-secondary no-underline",
                "hover:bg-brand-subtle hover:text-brand",
              )}
            >
              {route.name}
            </Link>
          ))}
        </nav>

        <div className="ms-auto flex items-center gap-2 lg:ms-0">
          <ThemeToggle />
          <button
            type="button"
            aria-expanded={menuOpen}
            // Only while the panel exists: `aria-controls` pointing at a missing
            // id is a broken reference, not a hint.
            aria-controls={menuOpen ? "site-menu" : undefined}
            aria-label={menuOpen ? t("closeMenu") : t("openMenu")}
            onClick={() => setMenuOpen((open) => !open)}
            className={cn(
              "grid size-10 cursor-pointer place-items-center rounded-control lg:hidden",
              "border border-line text-fg-secondary hover:bg-surface-2 hover:text-fg",
            )}
          >
            {menuOpen ? (
              <X className="size-4.5" aria-hidden="true" />
            ) : (
              <Menu className="size-4.5" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>

      {menuOpen ? (
        <div
          id="site-menu"
          onKeyDown={(event) => {
            if (event.key === "Escape") setMenuOpen(false);
          }}
          className={cn(
            "absolute inset-x-0 top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto lg:hidden",
            "border-b border-line bg-surface-raised px-4 pb-6 pt-4 shadow-md",
          )}
        >
          {NAV_GROUPS.map((group) => (
            // The group label is a <p>, not a heading: the menu sits above the
            // page <h1> in the DOM, and headings here would put an h2 before it
            // on every route. The <nav> carries the name instead.
            <nav key={group} aria-label={t(group)} className="mt-4 first:mt-0">
              <p className="text-label font-semibold uppercase tracking-[0.06em] text-fg-muted">
                {t(group)}
              </p>
              <ul className="mt-2 grid gap-1">
                {routesInGroup(group).map((route) => (
                  <li key={route.slug}>
                    <Link
                      href={`/${route.slug}`}
                      onClick={() => setMenuOpen(false)}
                      className="flex min-h-11 items-center text-sm text-fg-secondary no-underline hover:text-brand"
                    >
                      {route.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      ) : null}
    </header>
  );
}
