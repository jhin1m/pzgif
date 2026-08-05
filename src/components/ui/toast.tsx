"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { AlertTriangle, Check, CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Toast — docs/design-guidelines.md §5.11.
 *
 * Three rules from that section are load-bearing and are enforced here rather
 * than left to the caller:
 *
 *  - **Errors never auto-dismiss.** A failure the user missed is a failure they
 *    cannot act on, so the duration is derived from the variant, not passed in.
 *  - **Hovering or focusing pauses the timer** — Radix does this natively, which
 *    is most of why it is used here instead of a hand-rolled queue.
 *  - **Success announces politely, errors assert.** Radix maps that onto
 *    `role="status"` vs `role="alert"` through the `type` prop.
 *
 * Placement differs by breakpoint because the bottom of a phone belongs to the
 * sticky action bar (§9): bottom-right on desktop, top-centre on mobile.
 */

export type ToastVariant = "success" | "error" | "warning";

export interface ToastOptions {
  variant?: ToastVariant;
  title: string;
  description?: string;
}

interface ToastRecord extends ToastOptions {
  id: number;
}

/**
 * setTimeout clamps anything above the signed 32-bit limit back to firing
 * immediately, so "never" is the largest value it will honour: ~24 days, which
 * outlives any tab this runs in.
 */
const NEVER_DISMISS = 2 ** 31 - 1;
const SUCCESS_DISMISS_MS = 6_000;
/** §5.11: exit is 120ms. The record outlives the close by exactly that long. */
const EXIT_MS = 120;

const ToastContext = createContext<((options: ToastOptions) => void) | null>(
  null,
);

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error("useToast must be used inside <ToastProvider>");
  return toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  // Monotonic across the session. Deriving the id from the current queue would
  // restart at 1 whenever it emptied, and React would then reuse a key that an
  // outgoing toast still held.
  const nextId = useRef(1);

  const toast = useCallback((options: ToastOptions) => {
    setToasts((current) => [...current, { ...options, id: nextId.current++ }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    // Radix marks the root `data-state="closed"` first; removing the record in
    // the same tick would unmount it before the exit animation ran a frame.
    setTimeout(() => {
      setToasts((current) => current.filter((entry) => entry.id !== id));
    }, EXIT_MS);
  }, []);

  const value = useMemo(() => toast, [toast]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((entry) => (
          <ToastPrimitive.Root
            key={entry.id}
            type={entry.variant === "error" ? "foreground" : "background"}
            duration={
              entry.variant === "success" ? SUCCESS_DISMISS_MS : NEVER_DISMISS
            }
            onOpenChange={(open) => {
              if (!open) dismiss(entry.id);
            }}
            // Not `asChild`: Radix's Root is an <li> and its Viewport an <ol>, so
            // substituting a <div> would leave the viewport with non-list
            // children and drop the list semantics a screen reader uses to count
            // the queue.
            className={cn(
              toastShellClasses(entry.variant),
              "data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=closed]:duration-120",
              "data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-bottom-2",
            )}
          >
            <ToastBody
              variant={entry.variant}
              title={entry.title}
              description={entry.description}
            />
            <ToastPrimitive.Close asChild>
              <ToastCloseButton />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        {/* F6 rather than the Radix default of F8: §7.3 names F6 as the key
            that jumps to the toast region. */}
        <ToastPrimitive.Viewport
          hotkey={["F6"]}
          className={cn(
            "fixed z-[var(--z-toast)] flex max-w-[calc(100vw-32px)] flex-col gap-3 outline-none",
            "left-1/2 top-4 -translate-x-1/2",
            "md:left-auto md:right-6 md:top-auto md:bottom-6 md:translate-x-0",
          )}
        />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

const VARIANT_ICON = {
  success: Check,
  error: CircleAlert,
  warning: AlertTriangle,
} as const;

const VARIANT_STRIPE = {
  success: "before:bg-success",
  error: "before:bg-danger",
  warning: "before:bg-warning",
} as const;

const VARIANT_ICON_COLOUR = {
  success: "text-success",
  error: "text-danger",
  warning: "text-warning",
} as const;

/** The box itself (§5.11): raised surface, 12px radius, 4px status stripe. */
function toastShellClasses(variant: ToastVariant = "success"): string {
  return cn(
    "relative flex max-w-[380px] list-none items-start gap-3 overflow-hidden",
    "rounded-panel border border-line bg-surface-raised py-3.5 pl-5 pr-4 text-sm shadow-lg",
    "before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']",
    VARIANT_STRIPE[variant],
  );
}

function ToastBody({ variant = "success", title, description }: ToastOptions) {
  const Icon = VARIANT_ICON[variant];
  return (
    <>
      <Icon
        aria-hidden="true"
        className={cn(
          "mt-0.5 size-4.5 flex-none",
          VARIANT_ICON_COLOUR[variant],
        )}
      />
      <div className="min-w-0">
        <p className="font-semibold text-fg">{title}</p>
        {description ? <p className="text-fg-muted">{description}</p> : null}
      </div>
    </>
  );
}

/**
 * A static toast, for `/dev/states` — it shows all three variants at once
 * without opening three live ones. It shares `toastShellClasses` with the real
 * toast rather than restating them, so the gallery cannot drift from what ships.
 */
export function ToastCard({
  variant = "success",
  title,
  description,
  className,
  children,
  ...props
}: ToastOptions & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn(toastShellClasses(variant), className)} {...props}>
      <ToastBody variant={variant} title={title} description={description} />
      {children}
    </div>
  );
}

/** 44px target (§5.11) around a 28px visual, via padding rather than size. */
function ToastCloseButton(
  props: React.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  return (
    <button
      type="button"
      aria-label="Dismiss"
      className={cn(
        "relative ml-auto flex size-7 flex-none cursor-pointer items-center justify-center",
        "rounded-control text-fg-muted hover:bg-surface-2 hover:text-fg",
        "after:absolute after:inset-[-8px] after:content-['']",
      )}
      {...props}
    >
      <X className="size-4" aria-hidden="true" />
    </button>
  );
}
