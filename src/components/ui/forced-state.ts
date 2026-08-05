/**
 * `:hover`, `:active` and `:focus-visible` cannot be applied from markup, so a
 * screenshot of the component gallery would show every control in its resting
 * state — and drift in a hover treatment would be invisible in review.
 *
 * `docs/wireframe/states.html` solves this with `.is-hover` / `.is-active` /
 * `.is-focus` classes. The production components carry their styles as Tailwind
 * utilities instead, so the same idea is expressed as a `data-force` attribute
 * that each component pairs with its real pseudo-class rule:
 *
 *     hover:bg-brand-fill-hover data-[force=hover]:bg-brand-fill-hover
 *
 * The duplication is the point: the forced rule sits beside the live one, so the
 * two cannot drift without the diff showing it.
 *
 * This exists for `/dev/states` and for Phase 11's visual regression run. It
 * must never appear in product code — a forced state there would be a control
 * that lies about whether it is focused.
 */
export type ForcedState = "hover" | "active" | "focus";
