import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/lib/order-status";

/**
 * Glass surfaces for the customer account pages.
 *
 * Values come from the `--uc-*` tokens in account-theme.css; nothing here
 * hard-codes a colour, so the palette can change in one file.
 */
export function GlassCard({
  className,
  style,
  hover = false,
  ...props
}: React.ComponentProps<"div"> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        "uc-card rounded-[var(--uc-radius-lg,22px)] p-5 sm:p-6",
        hover && "uc-card-hover",
        className,
      )}
      style={style}
      {...props}
    />
  );
}

export type PillTone =
  "warning" | "info" | "teal" | "lime" | "success" | "danger";

/** Status pill, section 5.6 of the UI specification. */
export function StatusPill({
  tone,
  children,
  className,
}: {
  tone: PillTone;
  children: React.ReactNode;
  className?: string;
}) {
  const tones: Record<PillTone, string> = {
    warning:
      "bg-[color-mix(in_oklab,var(--uc-warning),transparent_85%)] text-[var(--uc-warning)]",
    info: "bg-[color-mix(in_oklab,var(--uc-info),transparent_85%)] text-[var(--uc-sky-500)]",
    teal: "bg-[color-mix(in_oklab,var(--uc-teal-500),transparent_85%)] text-[var(--uc-teal-500)]",
    lime: "bg-[color-mix(in_oklab,var(--uc-lime-500),transparent_80%)] text-[var(--uc-green-800)]",
    success:
      "bg-[color-mix(in_oklab,var(--uc-success),transparent_85%)] text-[var(--uc-success)]",
    danger:
      "bg-[color-mix(in_oklab,var(--uc-danger),transparent_85%)] text-[var(--uc-danger)]",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Maps an order status to its pill colour.
 *
 * Cancelled and delivered are terminal and read differently from an order
 * still moving, which is what the specification asks for in 5.6.
 */
export function toneForStatus(status: OrderStatus): PillTone {
  switch (status) {
    case "cancelled":
      return "danger";
    case "delivered":
      return "success";
    case "out_for_delivery":
      return "lime";
    case "ready_for_delivery":
      return "teal";
    case "picked_up":
      return "info";
    case "invoice_sent":
    case "payment_pending":
    case "pickup_requested":
    case "agent_assigned":
    default:
      return "warning";
  }
}

/** Two-letter monogram for the account avatar. */
export function initialsOf(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1] : undefined;
  if (!last) return first.slice(0, 2).toUpperCase();
  return `${first[0]}${last[0]}`.toUpperCase();
}
