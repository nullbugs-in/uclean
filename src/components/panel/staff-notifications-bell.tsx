"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Bell, ChevronRight } from "lucide-react";
import { toast } from "sonner";

import {
  markAllStaffNotificationsReadAction,
  markStaffNotificationReadAction,
} from "@/app/(staff)/staff/notifications/actions";
import { createClient } from "@/db/client";
import {
  staffNotificationTitle,
  type StaffNotificationRow,
} from "@/db/queries/staff-notifications";
import type { StaffNotificationPayload } from "@/db/types";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

/** The bell's props shape, threaded from the staff panel layout. */
export type StaffBellNotifications = {
  unread: number;
  items: StaffNotificationRow[];
};

/** The bell is a dropdown, not an inbox: the list is capped like the query. */
const MAX_ITEMS = 50;

/**
 * Reads the row's payload. Written by the assignment trigger and the slots
 * cron (migration 22); guarded, because a malformed row must degrade to a
 * plain entry rather than break the whole bell.
 */
function payloadOf(row: StaffNotificationRow): StaffNotificationPayload {
  const candidate = row.payload as unknown;
  if (!candidate || typeof candidate !== "object" || candidate === null) {
    return {};
  }
  return candidate as StaffNotificationPayload;
}

/** Where tapping the entry should take the staff member: the leg's own list. */
function hrefFor(row: StaffNotificationRow): string | null {
  if (!row.order_id) return null;
  return payloadOf(row).leg === "delivery"
    ? "/staff/deliveries"
    : "/staff/pickups";
}

/** "Assigned by Rajesh (auto)" styling for the row's third line. */
function assignmentOf(row: StaffNotificationRow): string | null {
  if (row.type !== "pickup_assigned" && row.type !== "delivery_assigned") {
    return null;
  }
  const payload = payloadOf(row);
  if (payload.assigned_by_type === "manual" && payload.assigned_by_name) {
    return `Assigned by ${payload.assigned_by_name}`;
  }
  return "Auto-assigned";
}

/** "10:00-12:00" style slot line: the label, then the slot date. */
function slotOf(row: StaffNotificationRow): string | null {
  const payload = payloadOf(row);
  if (!payload.slot_date) return null;
  const label = payload.slot_label
    ? payload.slot_label
    : payload.slot_start
      ? `${payload.slot_start}`
      : null;
  return label
    ? `${formatDate(payload.slot_date)} · ${label}`
    : formatDate(payload.slot_date);
}

/** The toast's description: order and slot, one line. */
function toastDescription(row: StaffNotificationRow): string {
  const payload = payloadOf(row);
  const parts = [payload.order_no, payload.customer_name, slotOf(row)].filter(
    (part): part is string => Boolean(part),
  );
  return parts.join(" · ");
}

/**
 * The staff panel's notification bell.
 *
 * A clone of the customer navbar bell (layout/navbar.tsx) against
 * `staff_notifications`: unread badge, newest-first scrollable list, read
 * entries dimmed, "Read all", optimistic state with the same render-time
 * prop-diff resync. Rows carry what a staff member acts on - which leg
 * (pickup/delivery), the order number, the slot and how it was assigned -
 * and tapping one marks it read and opens that leg's list.
 *
 * Realtime is the part the customer bell does not have: assignments happen
 * in the admin panel while the staff member is working elsewhere, so the bell
 * subscribes to inserts of `staff_notifications`. Replication runs through
 * RLS (migration 22), so the subscription only ever delivers the signed-in
 * staff member's own rows. Each insert raises a toast as well as a badge -
 * that instant "an order was just assigned to you" is the requirement this
 * component exists for, and sonner is already mounted panel-wide.
 *
 * A subscription that never connects costs nothing visible: the badge still
 * updates on the server on the next navigation or refresh, the same
 * philosophy `PickupRequestLive` uses for the omitted connection state.
 */
export function StaffNotificationsBell({
  notifications,
}: {
  notifications: StaffBellNotifications;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { unread, items: serverItems } = notifications;
  const [items, setItems] = useState<StaffNotificationRow[]>(serverItems);
  const [seen, setSeen] = useState(unread);
  const [seenCount, setSeenCount] = useState(unread);
  const [isPending, startTransition] = useTransition();
  const handledIds = useRef<Set<number>>(new Set());
  // Held in a ref so the subscription setup can read the mount-time list
  // without becoming a dependency of the effect: the subscription must live
  // exactly once, while props keep arriving.
  const mountItems = useRef<StaffNotificationRow[]>(serverItems);

  /*
   * React's documented way to derive state from a prop: compare against the
   * *previous prop* during render, not in an effect - identical to the
   * customer bell. Optimistic updates set `seen` (and `items`) only; the
   * server prop eventually carries the truth, and this resyncs to it once.
   */
  if (unread !== seenCount) {
    setSeenCount(unread);
    setSeen(unread);
    setItems(serverItems);
  }

  useDismissable(containerRef, open, () => setOpen(false));

  useEffect(() => {
    // Seed the realtime dedupe guard with what the server already sent, so a
    // replay of an existing row cannot double-insert it into the list.
    for (const item of mountItems.current) handledIds.current.add(item.id);

    const supabase = createClient();

    const channel = supabase
      .channel("staff-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "staff_notifications" },
        (payload) => {
          const row = payload.new as unknown as StaffNotificationRow;
          if (typeof row?.id !== "number") return;
          if (handledIds.current.has(row.id)) return;
          handledIds.current.add(row.id);

          // Newest at the top, capped like the query; the badge counts the
          // optimistic row immediately.
          setItems((current) => [row, ...current].slice(0, MAX_ITEMS));
          setSeen((count) => count + 1);

          toast.success(staffNotificationTitle(row.type), {
            description: toastDescription(row),
          });
        },
      )
      .subscribe(() => {
        // Deliberately silent: a quietly-dead subscription still leaves the
        // server-side badge correct on the next render, and a banner would
        // make staff distrust the count they can see.
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, []);

  function markAllRead() {
    // Clear first so the badge responds immediately; the action persists it.
    setSeen(0);
    setItems((current) =>
      current.map((item) =>
        item.read_at ? item : { ...item, read_at: new Date().toISOString() },
      ),
    );

    startTransition(async () => {
      await markAllStaffNotificationsReadAction();
    });
  }

  /**
   * Tapping one entry marks just that one read and navigates. Skips the write
   * when it is already read, so the action never reports work it did not do.
   */
  function openItem(notificationId: number, readAt: string | null) {
    if (!readAt) {
      setSeen((current) => Math.max(0, current - 1));
      setItems((current) =>
        current.map((item) =>
          item.id === notificationId && !item.read_at
            ? { ...item, read_at: new Date().toISOString() }
            : item,
        ),
      );
      startTransition(async () => {
        await markStaffNotificationReadAction({ notificationId });
      });
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          seen > 0 ? `Notifications, ${seen} recent` : "Notifications"
        }
        onClick={() => setOpen((value) => !value)}
        className="border-border text-foreground hover:bg-accent relative grid size-9 place-items-center rounded-full border transition-colors focus-visible:ring-2 focus-visible:outline-none"
      >
        <Bell className="size-4" aria-hidden="true" />
        {seen > 0 ? (
          <span
            aria-hidden="true"
            className="bg-destructive absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full px-1 text-[10px] leading-4 font-semibold text-white"
          >
            {seen > 9 ? "9+" : seen}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="bg-card border-border absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-1.5rem)] origin-top-right rounded-2xl border p-2 shadow-lg"
        >
          {/*
            Header and "Read all" on one line. The button is only rendered when
            there is something unread to clear - a permanently present control
            that does nothing is worse than no control.
          */}
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            <p className="text-muted-foreground text-xs tracking-wide uppercase">
              Notifications
            </p>

            {seen > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                disabled={isPending}
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-1.5 py-0.5 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60"
              >
                {isPending ? "Marking..." : "Read all"}
              </button>
            ) : null}
          </div>

          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-4 text-sm">
              Nothing new in the last week.
            </p>
          ) : (
            /*
              Newest first (the query orders created_at descending), scrolled
              from about four rows so the bell never becomes the height of the
              screen. The rows hold no focusable controls of their own, so the
              region is itself focusable and labelled.
            */
            <ul
              role="region"
              aria-label={`Notifications, ${items.length} in the last week`}
              tabIndex={0}
              className="focus-visible:outline-ring max-h-56 [scrollbar-width:thin] space-y-0.5 overflow-y-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
            >
              {items.map((item) => {
                const href = hrefFor(item);
                const assigned = assignmentOf(item);
                const slot = slotOf(item);

                const body = (
                  <>
                    <div className="min-w-0">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          // Read entries stay readable but stop competing
                          // with the unread ones for attention.
                          item.read_at && "text-muted-foreground font-normal",
                        )}
                      >
                        {staffNotificationTitle(item.type)}
                      </p>
                      <p className="text-muted-foreground font-mono text-xs">
                        {payloadOf(item).order_no}
                      </p>
                      {slot ? (
                        <p className="text-muted-foreground truncate text-xs">
                          {slot}
                        </p>
                      ) : null}
                      {assigned ? (
                        <p className="text-muted-foreground text-xs">
                          {assigned}
                        </p>
                      ) : null}
                    </div>

                    <span className="text-muted-foreground flex shrink-0 flex-col items-end gap-1 text-xs">
                      {formatDateTime(item.created_at)}
                      {href ? (
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                      ) : null}
                    </span>
                  </>
                );

                return (
                  <li key={item.id}>
                    {href ? (
                      <Link
                        href={href}
                        onClick={() => openItem(item.id, item.read_at)}
                        className="hover:bg-accent focus-visible:ring-ring flex items-start justify-between gap-3 rounded-xl px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none"
                      >
                        {body}
                      </Link>
                    ) : (
                      <div className="flex items-start justify-between gap-3 px-3 py-2">
                        {body}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Closes the dropdown on Escape or a click outside it. Duplicated rather than
 * exported from the customer navbar because the two panels are separate
 * surfaces; if they ever drift apart here, that is the bug to look for.
 */
function useDismissable(
  ref: React.RefObject<HTMLElement | null>,
  active: boolean,
  onDismiss: () => void,
) {
  useEffect(() => {
    if (!active) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onDismiss();
    }

    function onPointerDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) onDismiss();
    }

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mousedown", onPointerDown);
    };
  }, [active, onDismiss, ref]);
}
