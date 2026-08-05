"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme-init-script";

type Theme = "light" | "dark";

/**
 * Theme switch.
 *
 * `[data-theme]` on <html> is the source of truth, not React state — the boot
 * script in <head> has already set it before this component ever renders, and
 * duplicating it into state is what would reintroduce the flash the boot script
 * exists to prevent. So the attribute is treated as the external store and
 * subscribed to.
 *
 * Phase 3 owns the visual design of this control; what matters now is that the
 * `[data-theme]` contract works end to end.
 */

function subscribe(onStoreChange: () => void) {
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark"
    ? "dark"
    : "light";
}

/** The server cannot know the visitor's theme; the boot script corrects it. */
function getServerSnapshot(): Theme {
  return "light";
}

export function ThemeToggle() {
  const t = useTranslations("theme");
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage disabled (private mode): the theme still applies for this
      // session, it simply is not remembered.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t("toggle")}
      className="rounded-control border border-line-control px-3 py-1.5 text-sm hover:bg-surface-2"
    >
      {theme === "dark" ? t("light") : t("dark")}
    </button>
  );
}
