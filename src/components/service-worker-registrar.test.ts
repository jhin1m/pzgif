import { afterEach, describe, expect, it, vi } from "vitest";
import { unregisterAndPurge } from "./service-worker-registrar";

/**
 * What this file is protecting.
 *
 * A production run on localhost installs a worker that keeps controlling the
 * origin afterwards, and `pnpm dev` on the same port inherits it. That worker
 * serves `/_next/static/` cache-first on the contract that those URLs are
 * immutable — true of a content-hashed production chunk, false of a Turbopack
 * dev chunk, whose name comes from the source path and survives edits to the
 * bytes behind it. The tab is then pinned to pre-edit JavaScript: an export
 * added afterwards is missing at runtime, and the symptom is a `TypeError` on a
 * function the type-checker and the served bundle both agree exists.
 *
 * Declining to *register* does not fix that, because there was no new
 * registration involved. Eviction is the behaviour, and these are its two
 * halves: the registration goes, and the caches go with it — an unregistered
 * worker stops intercepting, but its Cache Storage outlives it and the next
 * production build reads the same stale entries straight back.
 *
 * Testing the exported helper rather than the component: the environment here is
 * `node`, there is no jsdom, and the effect wrapper is a two-line `NODE_ENV`
 * branch. The eviction is the part with something to get wrong.
 */

function stubGlobals({ registrations }: { registrations: number }) {
  const unregister = vi.fn().mockResolvedValue(true);
  const deleteCache = vi.fn().mockResolvedValue(true);

  vi.stubGlobal("navigator", {
    serviceWorker: {
      getRegistrations: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: registrations }, () => ({ unregister })),
        ),
    },
  });
  vi.stubGlobal("caches", {
    keys: vi.fn().mockResolvedValue(["pzgif-shell-v2", "pzgif-shell-v1"]),
    delete: deleteCache,
  });

  return { unregister, deleteCache };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unregisterAndPurge", () => {
  it("unregisters every worker controlling the origin", async () => {
    const { unregister } = stubGlobals({ registrations: 2 });

    await unregisterAndPurge();

    expect(unregister).toHaveBeenCalledTimes(2);
  });

  it("purges the caches the evicted worker was reading from", async () => {
    const { deleteCache } = stubGlobals({ registrations: 1 });

    await unregisterAndPurge();

    expect(deleteCache.mock.calls.flat()).toEqual([
      "pzgif-shell-v2",
      "pzgif-shell-v1",
    ]);
  });

  it("leaves Cache Storage alone when no worker was installed", async () => {
    // The common case by far, and it must stay cheap: a dev session that never
    // ran a production build has nothing to evict, and blowing away caches on
    // every page load would be a second bug wearing the first one's clothes.
    const { deleteCache } = stubGlobals({ registrations: 0 });

    await unregisterAndPurge();

    expect(deleteCache).not.toHaveBeenCalled();
  });
});
