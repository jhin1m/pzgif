import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import about from "@/content/legal/about.json";
import contact from "@/content/legal/contact.json";
import cookies from "@/content/legal/cookies.json";
import dmca from "@/content/legal/dmca.json";
import privacy from "@/content/legal/privacy.json";
import terms from "@/content/legal/terms.json";
import {
  CONTACT_EMAIL,
  OPERATOR_LOCATION,
  OPERATOR_NAME,
} from "@/lib/site-config";
import { routing } from "@/i18n/routing";
import { LEGAL_ROUTES } from "@/lib/tools/registry";
import { legalContent, type LegalContent } from "./legal";

/**
 * The mechanical half of the copy audit for the legal pages, applied now rather
 * than in Phase 11.
 *
 * These pages are read by two audiences who both treat them as evidence: an ad
 * network deciding whether to approve the site, and a visitor deciding whether
 * to drop a file into it. A claim that is wrong here is not a typo, it is a false
 * statement about how the product handles someone's data — and unlike a broken
 * tool, nothing about it fails visibly. Hence assertions rather than a reading
 * pass.
 */

const RAW: Readonly<Record<string, unknown>> = {
  about,
  contact,
  cookies,
  dmca,
  privacy,
  terms,
};

const PAGES: readonly LegalContent[] = LEGAL_ROUTES.map((route) =>
  legalContent(RAW[route.slug], route.slug),
);

/** Every string of prose in one page — lead, headings and paragraphs. */
function proseOf(page: LegalContent): string[] {
  return [
    page.lead,
    ...page.sections.flatMap((section) => [
      section.heading,
      ...section.paragraphs,
    ]),
  ];
}

const ALL_PROSE = PAGES.flatMap(proseOf).join("\n");

function wordsIn(page: LegalContent): number {
  return proseOf(page).join(" ").trim().split(/\s+/).length;
}

describe("the legal content files", () => {
  it("all validate against the schema", () => {
    for (const route of LEGAL_ROUTES) {
      expect(() => legalContent(RAW[route.slug], route.slug)).not.toThrow();
    }
  });

  it("has one file per footer route and no orphans", () => {
    const onDisk = readdirSync(
      new URL("../../content/legal", import.meta.url),
    ).map((name) => name.replace(/\.json$/, ""));

    expect(onDisk.sort()).toEqual(LEGAL_ROUTES.map((r) => r.slug).sort());
  });
});

/**
 * The validator's negative cases.
 *
 * Without these the loader is decoration: it would be equally "green" if every
 * check inside it were deleted, and the failure it exists to prevent — a Privacy
 * Policy that renders a heading and an empty body because a key was renamed — is
 * silent by nature.
 */
describe("the legal content validator", () => {
  it("rejects a slug that does not match the route", () => {
    expect(() => legalContent(about, "privacy")).toThrow(/does not match/);
  });

  it("rejects a file with no sections", () => {
    expect(() => legalContent({ ...about, sections: [] }, "about")).toThrow(
      /no sections/,
    );
  });

  it("rejects a section with no paragraphs", () => {
    const broken = {
      ...about,
      sections: [{ heading: "H", level: 2, paragraphs: [] }],
    };
    expect(() => legalContent(broken, "about")).toThrow(/no paragraphs/);
  });

  it("rejects a heading at an outline level the renderer cannot emit", () => {
    const broken = {
      ...about,
      sections: [{ heading: "H", level: 4, paragraphs: ["p"] }],
    };
    expect(() => legalContent(broken, "about")).toThrow(/expected 2 or 3/);
  });

  it("rejects a missing meta title", () => {
    const broken = { ...about, meta: { description: "d" } };
    expect(() => legalContent(broken, "about")).toThrow(/meta.title/);
  });

  it("rejects an updated date that is not ISO", () => {
    expect(() =>
      legalContent({ ...about, updated: "7 Aug 2026" }, "about"),
    ).toThrow(/expected YYYY-MM-DD/);
  });
});

describe("the operator's identity", () => {
  it("names the operator on About and in the Privacy controller section", () => {
    for (const slug of ["about", "privacy"]) {
      const page = PAGES.find((p) => p.slug === slug)!;
      expect(proseOf(page).join(" ")).toContain(OPERATOR_NAME);
    }
  });

  it("states where the operator is, on the pages where it has legal effect", () => {
    // Privacy: which privacy regime applies. Terms: governing law. About: who.
    for (const slug of ["about", "privacy", "terms"]) {
      const page = PAGES.find((p) => p.slug === slug)!;
      expect(proseOf(page).join(" ")).toContain(OPERATOR_LOCATION);
    }
  });

  it("gives the contact address on every page that tells a reader to write in", () => {
    for (const slug of ["contact", "privacy", "dmca", "terms"]) {
      const page = PAGES.find((p) => p.slug === slug)!;
      expect(proseOf(page).join(" ")).toContain(CONTACT_EMAIL);
    }
  });

  it("mentions no other email address anywhere", () => {
    // A stale `hello@` surviving one edit is a support channel that silently
    // goes nowhere, on the pages whose entire job is being reachable.
    const addresses = new Set(
      ALL_PROSE.match(/[\w.+-]+@[\w-]+\.[\w.-]+\w/g) ?? [],
    );
    expect([...addresses]).toEqual([CONTACT_EMAIL]);
  });
});

describe("the anti-template guard", () => {
  it("shares no paragraph between two pages", () => {
    // Six pages assembled from shared blocks is the scaled-content shape, and
    // it is only visible in comparison — which is what this does and a reader
    // will not.
    //
    // It catches copy-paste, not paraphrase: two paragraphs saying the same
    // thing in different words pass. That is the honest limit of a mechanical
    // check, and the reason the phase plan also asks for the six to be read side
    // by side once.
    const seen = new Map<string, string>();
    for (const page of PAGES) {
      for (const paragraph of proseOf(page)) {
        const key = paragraph.toLowerCase().replace(/\s+/g, " ").trim();
        // Headings are allowed to repeat; whole paragraphs are not.
        if (key.split(" ").length < 8) continue;
        const owner = seen.get(key);
        expect(
          owner,
          `"${paragraph.slice(0, 60)}…" appears in both ${owner} and ${page.slug}`,
        ).toBeUndefined();
        seen.set(key, page.slug);
      }
    }
  });

  it("keeps every page above its length floor", () => {
    // Floors, not targets: a page can grow freely, but a Privacy Policy quietly
    // reduced to four paragraphs stops being one.
    const FLOORS: Readonly<Record<string, number>> = {
      about: 400,
      contact: 220,
      cookies: 320,
      dmca: 400,
      privacy: 750,
      terms: 650,
    };
    for (const page of PAGES) {
      expect(wordsIn(page), `${page.slug} is too short`).toBeGreaterThanOrEqual(
        FLOORS[page.slug],
      );
    }
  });
});

describe("claims that must match the code", () => {
  it("keeps the no-cookie claim true", () => {
    // The Cookie Policy opens by saying the site sets no cookies. This is what
    // stops that from silently becoming false.
    //
    // Two mechanisms, because first-party code is not the likely regression.
    // Direct `document.cookie` is the obvious one and the rarest. The realistic
    // one is a library default: next-intl sets `NEXT_LOCALE` unless told not to,
    // and `localeCookie: false` in the routing config is the single line
    // suppressing it. Flipping that line would make this page false without any
    // source file gaining the string below.
    const offenders = sourceFiles().filter((file) =>
      readFileSync(file, "utf8").includes("document.cookie"),
    );
    expect(
      offenders,
      "the code sets a cookie — cookies.json says it does not",
    ).toEqual([]);

    // Read the resolved config rather than grepping the file: `routing.ts`
    // documents each option in a block comment above it, so a text search finds
    // `localeCookie: false` in the prose and passes even after the value has
    // been flipped. Importing the object skips the commentary entirely.
    expect(
      routing.localeCookie,
      "next-intl's NEXT_LOCALE cookie is no longer suppressed",
    ).toBe(false);

    expect(
      PAGES.find((p) => p.slug === "cookies")!.lead,
      "cookies.json no longer makes the claim this test protects",
    ).toContain("sets no cookies");
  });

  it("keeps the no-stored-file claim true", () => {
    // Both policies now say a tool-to-tool handoff passes through memory and is
    // never written down. That is true because `pending-file.ts` is a module
    // singleton — the first draft of this copy claimed IndexedDB, which the
    // codebase had explicitly rejected, and nothing caught it.
    // Property access, not the bare name: `pending-file.ts` explains at length
    // why it rejected both, and a guard that trips on prose discussing an API is
    // a guard that gets deleted the first time it cries wolf.
    const offenders = sourceFiles().filter((file) =>
      /\b(indexedDB|sessionStorage)\s*\./.test(readFileSync(file, "utf8")),
    );
    expect(
      offenders,
      "something now persists to storage the policies say is unused",
    ).toEqual([]);
  });

  it("records a GDPR Article 27 decision rather than omitting one", () => {
    // The parent phase doc is explicit that silence here is worse than either
    // answer, because an omission reads as an oversight to a regulator and as a
    // gap to an ad reviewer.
    const prose = proseOf(PAGES.find((p) => p.slug === "privacy")!).join(" ");
    expect(prose).toMatch(/Article 27/);
    expect(prose).toMatch(/27\(2\)\(a\)/);
  });

  it("carries the Australian Consumer Law carve-out in the Terms", () => {
    // A disclaimer drafted without it is void in Australia, which means the
    // liability sections above it protect nobody.
    const prose = proseOf(PAGES.find((p) => p.slug === "terms")!).join(" ");
    expect(prose).toContain("Australian Consumer Law");
    expect(prose).toMatch(/cannot lawfully be excluded/);
  });

  it("dates every page in the past", () => {
    const today = new Date().toISOString().slice(0, 10);
    for (const page of PAGES) {
      expect(page.updated <= today, `${page.slug} is dated in the future`).toBe(
        true,
      );
    }
  });
});

/** Every `.ts`/`.tsx` source file, excluding tests — which quote the pattern. */
function sourceFiles(): string[] {
  const roots = [
    new URL("../..", import.meta.url).pathname,
    new URL("../../../public", import.meta.url).pathname,
  ];
  const out: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (
        /\.(ts|tsx|js|mjs)$/.test(entry.name) &&
        !entry.name.includes(".test.")
      ) {
        out.push(path);
      }
    }
  };

  for (const root of roots) walk(root);
  return out;
}
