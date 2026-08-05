import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Badge — the status pill from `docs/wireframe/states.html` ("badges & status").
 *
 * §7.6 is the binding rule: colour is never the only signal. Every badge carries
 * text that states the fact — "−80% smaller", "Too big" — so a red pill and a
 * green pill still differ in forced-colors mode and to a colour-blind reader.
 * The text colours are the AA-checked `*-text` tokens from §7.1, not the fills.
 */

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-pill px-2.5 py-0.5 text-caption font-semibold",
  {
    variants: {
      variant: {
        success: "bg-success/15 text-success-text",
        accent: "bg-progress/15 text-accent-text",
        warning: "bg-warning/20 text-warning-text",
        danger: "bg-danger-subtle text-danger-text",
        neutral: "bg-surface-2 text-fg-muted",
      },
    },
    defaultVariants: { variant: "neutral" },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
