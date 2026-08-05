import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./button";

describe("Button", () => {
  it("keeps the idle label in the box while loading, so the width cannot change", () => {
    // §5.1: "the control keeps its rendered width (min-width frozen)". Both
    // labels occupy the same grid cell, so the box is as wide as the wider of
    // the two — in the server render as well as after hydration.
    const markup = renderToStaticMarkup(
      <Button loading loadingLabel="Compressing…">
        Compress GIF
      </Button>,
    );
    expect(markup).toContain("Compress GIF");
    expect(markup).toContain("Compressing…");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toMatch(
      /invisible[^"]*"[^>]*aria-hidden="true"|aria-hidden="true"[^>]*invisible/,
    );
  });

  it("defaults to type=button so it cannot submit a form by accident", () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain(
      'type="button"',
    );
  });

  it("carries the forced-state hook only when asked", () => {
    // The forced states exist for /dev/states screenshots; a product button must
    // never claim a state it is not in.
    expect(renderToStaticMarkup(<Button>Go</Button>)).not.toContain(
      "data-force",
    );
    expect(
      renderToStaticMarkup(<Button forceState="hover">Go</Button>),
    ).toContain('data-force="hover"');
  });

  /**
   * A static check on the class list, not on rendering: `:hover` and `:active`
   * cannot be triggered without a browser, so what can be asserted here is that
   * the pair exists. Its value is catching the case where a hover treatment is
   * changed and its `/dev/states` twin is not — which would make the gallery
   * screenshot disagree with the live control while both looked fine in review.
   * The rendered behaviour itself is covered in `e2e/component-states.spec.ts`.
   */
  it("pairs every hover and active rule with its forced twin, so they cannot drift", () => {
    for (const variant of [
      "primary",
      "secondary",
      "ghost",
      "danger",
    ] as const) {
      const markup = renderToStaticMarkup(
        <Button variant={variant}>Go</Button>,
      );
      const classes = /class="([^"]*)"/.exec(markup)?.[1] ?? "";
      for (const state of ["hover", "active"] as const) {
        const live =
          classes.match(
            new RegExp(
              `(?<!data-\\[force=\\w+\\]:)\\b${state}:[\\w[\\]/.-]+`,
              "g",
            ),
          ) ?? [];
        expect(
          live.length,
          `${variant} has no ${state} treatment`,
        ).toBeGreaterThan(0);
        for (const rule of live) {
          const forced = rule.replace(
            new RegExp(`^${state}:`),
            `data-[force=${state}]:`,
          );
          expect(classes, `${variant} is missing ${forced}`).toContain(forced);
        }
      }
    }
  });
});
