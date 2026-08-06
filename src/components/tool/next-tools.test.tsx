import {
  Children,
  isValidElement,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearPendingFile, takePendingFile } from "@/lib/handoff/pending-file";
import { chainTargets, relatedLiveRoutes } from "@/lib/tools/registry";
import { NextTools } from "./next-tools";

/**
 * What this file is protecting: the chip hands the *produced* file to the
 * *clicked* tool, and to nobody else.
 *
 * ── Why the registry is mocked and the handoff is not ──────────────────────
 * The route table is `registry.test.ts`'s subject, and asserting on it twice
 * would only couple this file to editorial decisions about which tools relate
 * to which. What matters here is the wiring: which list the component asks for,
 * how much of it it renders, and what a click puts into the handoff. So the
 * registry is a stub whose answers each test dictates, and `pending-file` is
 * the real module — the address it stores is the assertion.
 *
 * The stub also buys the one case the live registry cannot produce today. Every
 * live route is GIF→GIF with two or more live siblings, so a single-destination
 * row — the case that motivated the one-chip minimum for a row carrying a file —
 * only exists once a cross-format tool ships.
 *
 * ── Why the component is called rather than rendered ───────────────────────
 * There is no DOM here, the same as in `result-panel.test.tsx`. `NextTools`
 * holds no state and runs no effect, so calling it returns the element tree
 * directly and the handler can be invoked from it. A jsdom install would buy
 * nothing this needs.
 */

vi.mock("@/lib/tools/registry", () => ({
  chainTargets: vi.fn(),
  relatedLiveRoutes: vi.fn(),
}));

/**
 * `next-intl`'s client navigation reaches for `next/navigation`, which does not
 * resolve outside a Next build. The element `Link` produces is never rendered
 * here — only its props are read — so a placeholder is the whole requirement.
 */
vi.mock("@/i18n/navigation", () => ({ Link: () => null }));

const CROP = {
  slug: "crop-gif",
  name: "Crop GIF",
  group: "edit",
  status: "live",
  inputFormats: ["gif"],
  outputFormats: ["gif"],
  related: [],
} as const;

const RESIZE = { ...CROP, slug: "resize-gif", name: "Resize GIF" } as const;
const SPEED = {
  ...CROP,
  slug: "gif-speed-changer",
  name: "GIF speed",
} as const;

const SOURCE = "gif-compressor";

function result(name = "loop-small-compressed.gif") {
  return {
    blob: new Blob([new Uint8Array([0x47, 0x49, 0x46])], { type: "image/gif" }),
    name,
    format: "gif" as const,
  };
}

type ChipClick = Pick<
  MouseEvent<HTMLAnchorElement>,
  "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

type Chip = ReactElement<{
  href: string;
  onClick?: (event: ChipClick) => void;
  children?: ReactNode;
}>;

/** The `Link` elements in a rendered row, in render order. */
function chipsOf(rendered: ReturnType<typeof NextTools>): Chip[] {
  if (!rendered) return [];
  const children = (rendered.props as { children?: ReactNode }).children;
  return Children.toArray(children).filter(
    (child): child is Chip =>
      isValidElement(child) && "href" in (child.props as object),
  );
}

/** A plain left click, unless the test says otherwise. */
function click(chip: Chip, modifiers: Partial<ChipClick> = {}) {
  chip.props.onClick?.({
    button: 0,
    metaKey: false,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    ...modifiers,
  });
}

beforeEach(() => {
  clearPendingFile();
  vi.clearAllMocks();
  vi.mocked(chainTargets).mockReturnValue([CROP, RESIZE]);
  vi.mocked(relatedLiveRoutes).mockReturnValue([CROP, RESIZE]);
});

describe("NextTools", () => {
  it("asks for destinations that can decode what was produced", () => {
    NextTools({ slug: SOURCE, label: "Send this to", result: result() });
    expect(chainTargets).toHaveBeenCalledWith(SOURCE, "gif");
    expect(relatedLiveRoutes).not.toHaveBeenCalled();
  });

  it("hands the produced file to the tool whose chip was clicked", () => {
    const chips = chipsOf(
      NextTools({ slug: SOURCE, label: "Send this to", result: result() }),
    );
    click(chips[1]);

    const handed = takePendingFile(RESIZE.slug);
    expect(handed?.name).toBe("loop-small-compressed.gif");
    expect(handed?.size).toBe(3);
    // The MIME type comes off the blob, not off the name. A destination that
    // sniffs before decoding gets the same answer the origin had.
    expect(handed?.type).toBe("image/gif");
  });

  it("stashes nothing on a click that will not navigate", () => {
    // A ⌘-click opens a new tab — a new realm, which cannot see this handoff —
    // and `Link` declines to navigate here. Stashing anyway would leave this tab
    // armed for a tool the visitor opened elsewhere, so that reaching it later
    // by any ordinary link would load a stale file and render no dropzone. The
    // address in `pending-file.ts` cannot catch that: the slug matches.
    const chips = chipsOf(
      NextTools({ slug: SOURCE, label: "Send this to", result: result() }),
    );

    for (const modifier of [
      { metaKey: true },
      { ctrlKey: true },
      { shiftKey: true },
      { altKey: true },
      { button: 1 },
    ]) {
      click(chips[0], modifier);
      expect(takePendingFile(CROP.slug), JSON.stringify(modifier)).toBeNull();
    }
  });

  it("addresses the handoff to the destination, never to the source", () => {
    const chips = chipsOf(
      NextTools({ slug: SOURCE, label: "Send this to", result: result() }),
    );
    click(chips[0]);
    expect(takePendingFile(CROP.slug)?.name).toBe("loop-small-compressed.gif");

    // The same click read from the source page instead: not its file. Stashed
    // again rather than read twice, because `takePendingFile` clears on read
    // whether the address matched or not.
    click(chips[0]);
    expect(takePendingFile(SOURCE)).toBeNull();
  });

  it("stays a plain suggestion list with no result", () => {
    // The state gallery path. No file exists, so no chip may arm a handoff.
    const chips = chipsOf(NextTools({ slug: SOURCE, label: "Next?" }));
    expect(relatedLiveRoutes).toHaveBeenCalledWith(SOURCE);
    expect(chainTargets).not.toHaveBeenCalled();

    click(chips[0]);
    expect(chips[0].props.onClick).toBeUndefined();
    expect(takePendingFile(CROP.slug)).toBeNull();
  });

  it("renders the row when the format filter leaves a single destination", () => {
    // Why a row carrying a file needs only one chip: `gif-to-mp4` will have
    // exactly one valid destination, and hiding the row there would remove the
    // whole point of the feature on that page.
    vi.mocked(chainTargets).mockReturnValue([CROP]);
    const chips = chipsOf(
      NextTools({ slug: SOURCE, label: "Send this to", result: result() }),
    );
    expect(chips.map((chip) => chip.props.href)).toEqual(["/crop-gif"]);
  });

  it("still hides a lone chip when it is only a suggestion", () => {
    // Without a file the chip is a suggestion again, and one suggestion after a
    // divider reads as a broken list rather than as a choice.
    vi.mocked(relatedLiveRoutes).mockReturnValue([CROP]);
    expect(NextTools({ slug: SOURCE, label: "Send to" })).toBeNull();
  });

  it("renders nothing when there is nowhere to send the file", () => {
    vi.mocked(chainTargets).mockReturnValue([]);
    expect(
      NextTools({ slug: SOURCE, label: "Send this to", result: result() }),
    ).toBeNull();
  });

  it("still stops at two chips", () => {
    // The panel's reserved height is one constant for every tool, and at 375px
    // a third chip wraps to a third 44px line.
    vi.mocked(chainTargets).mockReturnValue([CROP, RESIZE, SPEED]);
    const chips = chipsOf(
      NextTools({ slug: SOURCE, label: "Send this to", result: result() }),
    );
    expect(chips.map((chip) => chip.props.href)).toEqual([
      "/crop-gif",
      "/resize-gif",
    ]);
  });
});
