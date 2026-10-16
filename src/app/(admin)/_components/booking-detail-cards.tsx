import type { LucideIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { OrderStatus } from "@/db/types";
import { cn } from "@/lib/utils";

/**
 * The small building blocks the booking screen is assembled from.
 *
 * They live together rather than beside the page because they are one visual
 * language: a status pill, a labelled fact, and a titled card. The booking screen
 * is almost entirely made of those three, and keeping them here means the
 * customer card and the pickup card cannot drift into looking like different
 * products.
 */

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Which badge tone a stage reads as.
 *
 * Grouped by what an admin should think when they see it, not by where it sits in
 * the sequence:
 *
 *   destructive  the booking is closed and did not complete
 *   success      the work finished
 *   warning      nothing is wrong, but someone has to act
 *   default      the shop is actively working on it
 *   secondary    waiting on the customer or on money
 */
function statusTone(
  status: OrderStatus,
): "destructive" | "success" | "warning" | "default" | "secondary" {
  switch (status) {
    case "cancelled":
      return "destructive";
    case "delivered":
      return "success";
    case "pickup_requested":
    case "agent_assigned":
      return "warning";
    case "picked_up":
    case "under_analysis":
    case "in_process":
    case "ready_for_delivery":
    case "out_for_delivery":
      return "default";
    default:
      return "secondary";
  }
}

/** Where a booking is now, as a coloured pill. */
export function StatusPill({
  status,
  label,
  className,
}: {
  status: OrderStatus;
  label: string;
  className?: string;
}) {
  return (
    <Badge variant={statusTone(status)} className={className}>
      {label}
    </Badge>
  );
}

/**
 * The lifecycle position as a bordered strip.
 *
 * `statusProgress` lives in the shared `CycleMeter`, and this is the one place the
 * admin screen draws it. Deliberately not tinted by `statusTone`: the tint belongs
 * to the pill, which sits right next to this, and two competing colours for one
 * fact is noise rather than emphasis.
 */
export function ProgressStrip({
  status,
  label,
  progress,
  className,
}: {
  status: OrderStatus;
  label: string;
  /** 0..1 through the lifecycle, from `statusProgress`. */
  progress: number;
  className?: string;
}) {
  const closed = status === "cancelled";

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-muted-foreground text-xs font-medium">
          {label}
        </span>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {closed ? "Closed" : `${Math.round(progress * 100)}%`}
        </span>
      </div>

      <div
        className="bg-muted h-1.5 w-full overflow-hidden rounded-full"
        role="presentation"
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500 ease-out",
            closed
              ? "bg-destructive"
              : status === "delivered"
                ? "bg-emerald-500"
                : "bg-primary",
          )}
          style={{ width: `${Math.round(progress * 100)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Facts and sections
// ---------------------------------------------------------------------------

/**
 * One labelled fact.
 *
 * A booking has ~15 of these, and a flat definition list of 15 rows is a wall.
 * Split into bordered tiles they are scannable and they tile across the width,
 * which is the whole point of the card layout: the page shows the same facts but
 * groups them.
 *
 * `hint` is for the second line that qualifies the value — the slot under the
 * date, a staff id under a name — rather than being a third fact of its own.
 */
export function FactTile({
  icon: Icon,
  label,
  value,
  hint,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-muted/30 flex min-w-0 items-start gap-3 rounded-lg border px-3 py-2.5",
        className,
      )}
    >
      <span className="bg-background text-muted-foreground mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border">
        <Icon aria-hidden className="size-3.5" />
      </span>

      <div className="min-w-0">
        <p className="text-muted-foreground text-xs">{label}</p>
        <div className="mt-0.5 text-sm font-medium break-words">{value}</div>
        {hint ? (
          <div className="text-muted-foreground mt-0.5 text-xs break-words">
            {hint}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/**
 * A card with an icon, a title and an optional description.
 *
 * Every card on the booking screen is shaped like this, so the icon column lines
 * up down the page and the eye can jump between sections by icon alone.
 */
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  tone = "default",
  className,
  contentClassName,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** `danger` tints the icon for the cancellation card. */
  tone?: "default" | "danger";
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-lg",
              tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary",
            )}
          >
            <Icon aria-hidden className="size-4" />
          </span>

          <div className="min-w-0 flex-1">
            <CardTitle className="text-base">{title}</CardTitle>
            {description ? (
              <CardDescription className="mt-1">{description}</CardDescription>
            ) : null}
          </div>

          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      </CardHeader>

      <CardContent className={contentClassName}>{children}</CardContent>
    </Card>
  );
}
