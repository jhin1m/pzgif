import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPendingFile,
  setPendingFile,
  takePendingFile,
} from "./pending-file";

const gif = (name: string) =>
  new File([new Uint8Array([0x47, 0x49, 0x46, 0x38])], name, {
    type: "image/gif",
  });

describe("the pending-file handoff", () => {
  beforeEach(() => {
    clearPendingFile();
  });

  it("hands the file to the tool it was addressed to", () => {
    const file = gif("loop.gif");
    setPendingFile(file, "gif-compressor");
    expect(takePendingFile("gif-compressor")).toBe(file);
  });

  it("returns null on a second take", () => {
    // This is the whole safety property. Strict Mode invokes a mount effect
    // twice, and a module that kept the file would load it into the page a
    // second time — or worse, into a page the visitor navigated to afterwards.
    setPendingFile(gif("loop.gif"), "gif-compressor");
    takePendingFile("gif-compressor");
    expect(takePendingFile("gif-compressor")).toBeNull();
  });

  it("returns null when nothing was ever set", () => {
    // The cold-load path: a tool page opened from a link, a bookmark or a
    // reload has to behave exactly as it always did.
    expect(takePendingFile("gif-compressor")).toBeNull();
  });

  it("does not hand a file to a tool it was not meant for", () => {
    // A ⌘-click on a picker chip fires the click handler — so the file is
    // stashed — and then `Link` sees the modifier and does not navigate. The
    // origin tab is left holding an armed handoff, and the next client
    // navigation to any tool page would otherwise consume it.
    setPendingFile(gif("clip.gif"), "mp4-to-gif");
    expect(takePendingFile("gif-compressor")).toBeNull();
  });

  it("clears a mis-addressed file rather than leaving it armed", () => {
    // Taking always clears, match or not. A file the intended page never
    // collected is stale by the time another page asks, and leaving it would
    // both hold a blob alive and eventually load it somewhere wrong.
    setPendingFile(gif("clip.gif"), "mp4-to-gif");
    takePendingFile("gif-compressor");
    expect(takePendingFile("mp4-to-gif")).toBeNull();
  });

  it("keeps the last file when set twice", () => {
    // Dropping a second file on the homepage before picking a tool replaces the
    // first. Queueing them would send the visitor to a tool holding the file
    // they had just replaced.
    const first = gif("first.gif");
    const second = gif("second.gif");
    setPendingFile(first, "gif-compressor");
    setPendingFile(second, "gif-compressor");
    expect(takePendingFile("gif-compressor")).toBe(second);
  });

  it("clears a file that was set but never consumed", () => {
    // Removing the file on the homepage has to release it. Otherwise a visitor
    // who drops a 200 MB GIF and changes their mind leaves it alive for the
    // lifetime of the tab.
    setPendingFile(gif("abandoned.gif"), "gif-compressor");
    clearPendingFile();
    expect(takePendingFile("gif-compressor")).toBeNull();
  });
});
