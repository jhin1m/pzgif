---
phase: 4
title: "Homepage file handoff"
status: complete
priority: P1
effort: "0.5-1d"
dependencies: []
---

# Phase 4: Homepage file handoff

## Overview

The mechanism that makes the homepage a tool rather than a menu: a file dropped
on `/` arrives at the chosen tool page already loaded. Built and tested on its
own, before any homepage UI depends on it.

## Requirements

- Functional: a `File` set on the homepage is consumed exactly once by the next
  tool page that mounts.
- Functional: a tool page reached by any other route — direct link, reload,
  back-button — behaves exactly as it does today.
- Non-functional: no `sessionStorage`, no `IndexedDB`, no serialization. A `File`
  is not structured-cloneable into `sessionStorage` and copying tens of megabytes
  through IndexedDB to cross a client-side navigation is work for nothing.
- Non-functional: the module must not retain a `File` after it is consumed —
  holding a 200 MB blob alive after use is a memory leak on a device this
  product's memory model is already tight on.

## Architecture

### Why a module singleton is correct here

Next App Router client navigation does not reload the document. The JavaScript
realm survives, so module-level state survives with it. That makes the handoff a
seven-line module rather than a storage problem.

```ts
// src/lib/handoff/pending-file.ts
let pending: File | null = null;

/** Hand a file to the next tool page that mounts. Overwrites any previous. */
export function setPendingFile(file: File): void {
  pending = file;
}

/** Consume the handed-off file. Returns null on a cold load. Idempotent. */
export function takePendingFile(): File | null {
  const file = pending;
  pending = null;
  return file;
}

/** Drop a file that was set but never consumed. */
export function clearPendingFile(): void {
  pending = null;
}
```

`take` clears on read. That single decision covers four cases at once:

| Case | Result |
|---|---|
| Drop → pick → tool mounts | File consumed, tool loads it |
| Tool page reloaded (F5) | Realm is new, `pending` is `null`, normal empty dropzone |
| User navigates back to `/` then to a different tool | Already consumed, no stale file |
| React Strict Mode double-mounts the effect | Second call gets `null`; the tool already has the file in state |

### Consuming it

Both intake components already expose the exact seam needed — a single
`handleFile(file)` callback (`gif-workbench.tsx:204`,
`gif-compressor-tool.tsx:214`) that probes and sets state. The consumer is one
effect:

```tsx
useEffect(() => {
  const handed = takePendingFile();
  if (handed) handleFile(handed);
  // Runs once on mount. `handleFile` is stable (useCallback) and the module
  // clears on read, so a re-run cannot double-load.
}, [handleFile]);
```

Put it in a `useHandoffFile(handleFile)` hook in `src/hooks/` so both call sites
share one implementation and one comment.

### What this phase does NOT do

No UI. No sniffing. No chips. Phase 6 builds the surface that calls
`setPendingFile`. This phase ships the mechanism plus a temporary test harness.

## Related Code Files

- Create: `src/lib/handoff/pending-file.ts`
- Create: `src/lib/handoff/pending-file.test.ts`
- Create: `src/hooks/use-handoff-file.ts`
- Modify: `src/components/tool/gif-workbench.tsx` — call the hook
- Modify: `src/app/[locale]/gif-compressor/gif-compressor-tool.tsx` — call the hook

## Implementation Steps

1. Write `pending-file.ts` with the three functions above.
2. Write `pending-file.test.ts`: set-then-take returns the file; a second take
   returns `null`; set-twice keeps the last; clear empties it.
3. Write `use-handoff-file.ts`. Document why the effect is mount-only and why a
   double invocation is safe.
4. Wire it into `gif-workbench.tsx` and the compressor.
5. Verify no behaviour change on a cold load: `pnpm test:e2e` must be unchanged
   against the Phase 1 baseline, since no page sets a pending file yet.
6. Manual check with a scratch button on `/dev/states` that calls
   `setPendingFile` and links to `/gif-compressor`. Remove the scratch button
   before merge — Phase 6 supplies the real caller.

## Success Criteria

- [ ] `takePendingFile()` returns the file once and `null` thereafter
- [ ] A tool page loaded directly or reloaded shows its normal empty dropzone
- [ ] No `File` reference survives in the module after consumption
- [ ] Strict Mode double-mount does not double-load or throw
- [ ] Unit tests cover set / take / take-again / set-twice / clear
- [ ] E2E suite unchanged against the Phase 1 baseline
- [ ] No `sessionStorage`, `localStorage` or `IndexedDB` introduced
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` green

## Risk Assessment

| Risk | Mitigation |
|---|---|
| A future navigation to a tool page becomes a hard navigation and the file is silently lost | The tool page's own dropzone is always the fallback and always rendered. Phase 7's E2E asserts the reload path explicitly, so a regression here fails a test rather than a user |
| The module holds a large `File` alive if the user drops one and never picks a tool | Phase 6's picker calls `clearPendingFile()` when the user resets or removes the file on the homepage |
| Server-side rendering touches the module and leaks a file across requests | The module is only imported by client components. Phase 7 asserts `pending-file.ts` appears in no server bundle |
| Two tabs interfere | Module state is per-realm, so tabs are naturally isolated. No mitigation needed — recorded so nobody "fixes" it with shared storage |
