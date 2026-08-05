import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { ForcedState } from "./forced-state";

/**
 * Button — docs/design-guidelines.md §5.1.
 *
 * Four variants × six states. Two rules from that section are structural rather
 * than cosmetic and are worth stating here:
 *
 *  - **Loading must not shift the layout.** The spec says the control "keeps its
 *    rendered width (`min-width` frozen)". Measuring the width in an effect and
 *    pinning it would be a frame late and would not survive SSR, so instead both
 *    labels are rendered into the same grid cell: the idle label stays in the
 *    box, invisible and `aria-hidden`, and the busy label overlays it. The box
 *    is therefore as wide as the wider of the two in every render, including the
 *    server one, and nothing moves when the state flips.
 *  - **Only one primary per viewport** on a tool page (§5.1). That is a
 *    composition rule this component cannot enforce; Phase 5 owns it, and
 *    "Compress" demotes to secondary once a result exists.
 *
 * Touch targets: `sm` (32px) and `md` (40px) are below the 44px floor in §5's
 * shared rules, so they carry an invisible 44px-tall hit area below `md` — extra
 * padding, not a bigger box, exactly as that rule requires.
 */

const buttonVariants = cva(
  cn(
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-control border border-transparent font-semibold leading-none",
    "cursor-pointer",
    // Colour, opacity and transform only — never a size or a margin (§6).
    "transition-[background-color,border-color,color,box-shadow,transform] duration-[120ms] ease-out",
    "disabled:pointer-events-none disabled:cursor-not-allowed",
    "aria-disabled:cursor-not-allowed",
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "bg-brand-fill text-fg-on-primary shadow-sm",
          "hover:bg-brand-fill-hover data-[force=hover]:bg-brand-fill-hover",
          "active:translate-y-px active:bg-brand-fill-hover active:shadow-none",
          "data-[force=active]:translate-y-px data-[force=active]:bg-brand-fill-hover data-[force=active]:shadow-none",
          "disabled:bg-surface-disabled disabled:text-fg-disabled disabled:shadow-none",
          "aria-disabled:bg-surface-disabled aria-disabled:text-fg-disabled aria-disabled:shadow-none",
        ),
        secondary: cn(
          "border-line-control bg-surface-2 text-fg",
          "hover:border-line-control-hover hover:bg-surface-hover",
          "data-[force=hover]:border-line-control-hover data-[force=hover]:bg-surface-hover",
          "active:translate-y-px data-[force=active]:translate-y-px",
          "disabled:border-line disabled:bg-transparent disabled:opacity-55",
          "aria-disabled:border-line aria-disabled:bg-transparent aria-disabled:opacity-55",
        ),
        ghost: cn(
          "bg-transparent text-fg-secondary",
          "hover:bg-brand-subtle hover:text-brand data-[force=hover]:bg-brand-subtle data-[force=hover]:text-brand",
          "active:translate-y-px active:bg-brand-subtle-strong",
          "data-[force=active]:translate-y-px data-[force=active]:bg-brand-subtle-strong",
          "disabled:opacity-50 aria-disabled:opacity-50",
        ),
        danger: cn(
          "border-danger bg-transparent text-danger-text",
          "hover:bg-danger-subtle data-[force=hover]:bg-danger-subtle",
          "active:translate-y-px data-[force=active]:translate-y-px",
          // §5.1: the danger ring uses --danger, not the brand focus ring.
          "focus-visible:outline-danger",
          "disabled:opacity-50 aria-disabled:opacity-50",
        ),
      },
      size: {
        sm: cn(
          "min-h-8 px-3 text-label",
          "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] md:after:hidden",
        ),
        md: cn(
          "min-h-10 px-4 text-sm",
          "after:absolute after:inset-x-0 after:top-1/2 after:h-11 after:-translate-y-1/2 after:content-[''] md:after:hidden",
        ),
        lg: "min-h-12 px-6 text-body",
        xl: "min-h-14 w-full px-6 text-body",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Swaps the label for `loadingLabel` and marks the control `aria-busy`. The
   * button keeps the width of the wider label, so nothing reflows.
   */
  loading?: boolean;
  loadingLabel?: React.ReactNode;
  /** Screenshot support for /dev/states. Never set this in product code. */
  forceState?: ForcedState;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  loadingLabel,
  forceState,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      data-force={forceState}
      aria-busy={loading || undefined}
      className={cn(
        buttonVariants({ variant, size }),
        loading && "pointer-events-none",
        forceState === "focus" && "force-focus",
        className,
      )}
      {...props}
    >
      {loading ? (
        <span className="grid items-center justify-items-center">
          <span
            aria-hidden="true"
            className="invisible col-start-1 row-start-1 inline-flex items-center gap-2"
          >
            {children}
          </span>
          <span className="col-start-1 row-start-1 inline-flex items-center gap-2">
            <Spinner />
            {loadingLabel ?? children}
          </span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}

/** 16px, 0.8s linear (§5.1). Decorative: the label carries the meaning. */
function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-4 flex-none animate-spin rounded-full border-2 border-current border-t-transparent [animation-duration:0.8s]"
    />
  );
}

export { buttonVariants };
