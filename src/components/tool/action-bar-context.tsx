"use client";

import { createContext, useContext } from "react";

/**
 * Whether the mobile sticky action bar currently occupies the bottom of the
 * viewport.
 *
 * ── Why this is a context and not a prop ────────────────────────────────────
 * `design-guidelines.md` §8.1 makes the bottom anchor ad and the sticky action
 * bar **mutually exclusive**, and §9 repeats it: the anchor is suppressed while
 * the bar is visible. Two elements pinned to the bottom of a 667px phone is both
 * an ad-density violation (§8.4, Better Ads < 30%) and the fastest way to bury
 * the primary action.
 *
 * They are also nowhere near each other in the tree — the bar sits inside the
 * tool, the anchor sits in the page chrome — so a prop would have to be threaded
 * through every tool page, and one page forgetting it is a policy breach nobody
 * would notice in review. Making `AdSlot variant="anchor"` render nothing while
 * the bar is up turns the rule into something the component enforces.
 *
 * Same mechanism for the consent bar, which has the identical problem.
 *
 * ── Why the flag is a prop and not an effect ────────────────────────────────
 * The bar used to register itself from a `useEffect` after mount. That made the
 * anchor slot render in the static HTML and then disappear on hydration — a
 * layout shift on the exact element §8.2 requires to be reserved from first
 * paint, introduced by the code meant to protect it. It also suppressed the
 * consent bar on desktop, where the action bar is `display: none` and its effect
 * ran anyway.
 *
 * So the flag is declared by whoever renders the page, in the same render pass
 * that decides whether the bar exists. Server and client agree, and nothing
 * moves after hydration.
 *
 * The root layout renders the default (`false`) provider so the chrome always
 * has a value to read. A tool page that shows the bar nests its own provider
 * around its subtree — `<BottomBarProvider actionBarVisible={hasFile}>` — which
 * is the same render pass that decides whether the bar is there at all.
 */

const BottomBarContext = createContext(false);

export function BottomBarProvider({
  actionBarVisible = false,
  children,
}: {
  /** True exactly when the page renders a `StickyActionBar`. */
  actionBarVisible?: boolean;
  children: React.ReactNode;
}) {
  return (
    <BottomBarContext.Provider value={actionBarVisible}>
      {children}
    </BottomBarContext.Provider>
  );
}

/** True when the bottom of the viewport is already claimed. */
export function useActionBarVisible() {
  return useContext(BottomBarContext);
}
