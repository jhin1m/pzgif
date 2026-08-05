"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { THEME_STORAGE_KEY } from "@/lib/theme/theme-init-script";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark";

/**
 * Theme switch.
 *
 * `[data-theme]` on `<html>` is the source of truth, not React state — the boot
 * script in `<head>` has already set it before this component renders, and
 * duplicating it into state is what would reintroduce the flash that script
 * exists to prevent. So the attribute *is* the external store, and this
 * subscribes to it.
 *
 * The icon-only control carries a real `aria-label` and `aria-pressed`; §5.6's
 * rule against icon-only labelling is about switches inside the tool flow, where
 * the state has consequences. Here the icon shows the theme you would move to,
 * and the label says so.
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

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("theme");
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next: Theme = theme === "dark" ? "light" : "dark";

  const toggle = () => {
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
      aria-pressed={theme === "dark"}
      aria-label={t(next === "dark" ? "switchToDark" : "switchToLight")}
      className={cn(
        "grid size-10 cursor-pointer place-items-center rounded-control",
        "border border-line bg-transparent text-fg-secondary",
        "transition-colors duration-[120ms] ease-out hover:bg-surface-2 hover:text-fg",
        className,
      )}
    >
      {theme === "dark" ? (
        <Sun className="size-4.5" aria-hidden="true" />
      ) : (
        <Moon className="size-4.5" aria-hidden="true" />
      )}
    </button>
  );
}
