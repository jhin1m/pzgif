"use client";

import { useSyncExternalStore } from "react";
import { detectCapabilities, type Capabilities } from "@/lib/media/capability";

/**
 * What this device can do, for the parts of the UI that must say so up front.
 *
 * ── Why it is null on the first render, and must stay that way ─────────────
 * Every route here is statically prerendered. The server has no device, so a
 * component that read `detectCapabilities()` during render would produce markup
 * that disagrees with the client's on any device where the answer is not the
 * build machine's — which is the whole point of asking. Returning null for the
 * server snapshot makes the two passes agree by construction, and React swaps in
 * the real answer on hydration.
 *
 * ── Why `useSyncExternalStore` and not state plus an effect ────────────────
 * The device is exactly what this API is for: a value that lives outside React,
 * never changes, and has a different answer on the server. Writing it as
 * `useState` + `useEffect` would set state during the effect that runs on mount,
 * which is a second render pass for a value that was available synchronously —
 * and `react-hooks/set-state-in-effect` fails the build on it, correctly.
 *
 * The consequence is a real constraint on callers: whatever they render for
 * `null` and whatever they render for a refusal must occupy the same box, or the
 * device answer arriving causes layout shift on a page whose CLS budget is zero.
 * `GifWorkbench`'s intake region is a fixed height for exactly this.
 */

/** Nothing to subscribe to — the device does not change mid-session. */
const subscribe = () => () => {};

/**
 * `detectCapabilities()` memoises, so this returns the *same object* on every
 * call. That is load-bearing rather than an optimisation: a snapshot getter that
 * built a fresh object each time would make React see a new value on every
 * render and loop forever.
 */
const getClientSnapshot = (): Capabilities => detectCapabilities();
const getServerSnapshot = (): Capabilities | null => null;

export function useCapabilities(): Capabilities | null {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot);
}
