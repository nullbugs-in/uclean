"use client";

import * as React from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

import {
  addMonths,
  buildMonthCells,
  monthOf,
  type KeyedMonth,
  type PickableDay,
} from "../calendar";
import { WEEKDAY_INITIALS, formatFullDate, formatMonthYear } from "../format";

type DatePickerProps = {
  /** Every day in the bookable window, oldest first. */
  days: (PickableDay & { dateKey: string })[];
  selectedDate: string | null;
  onSelectDate: (dateKey: string) => void;
};

/** Where the panel sits, in fixed viewport coordinates. */
type Placement = { top: number; left: number };

const PANEL_WIDTH = 336;
const GAP = 8;
const EDGE = 8;

/**
 * A calendar icon that opens a month grid.
 *
 * Hand-rolled rather than composed from a popover primitive, deliberately: it
 * needs one panel anchored to one button, and building it from `cn` and a couple
 * of measurements keeps the booking flow independent of the shared UI library.
 *
 * The panel is positioned `fixed` from the icon's own rect rather than absolutely
 * within it, so no ancestor with `overflow` can clip it, and it flips above the
 * icon when there is not room below. It re-measures on scroll and resize while
 * open, because a fixed panel anchored to a moving page would otherwise drift
 * away from its button.
 *
 * Both date controls on this step read the same list and can only offer a day the
 * server said has a slot free, so the icon and the week strip cannot disagree.
 */
export function DatePicker({
  days,
  selectedDate,
  onSelectDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<Placement | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);

  const byDate = React.useMemo(
    () => new Map(days.map((day) => [day.dateKey, day])),
    [days],
  );

  const firstKey = days[0]?.dateKey ?? null;
  const lastKey = days[days.length - 1]?.dateKey ?? null;
  const todayKey = firstKey;

  const [visible, setVisible] = React.useState<KeyedMonth>(() =>
    monthOf(firstKey),
  );

  const cells = React.useMemo(
    () => buildMonthCells(visible, byDate),
    [visible, byDate],
  );

  const measure = React.useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const panelHeight = panelRef.current?.offsetHeight ?? 320;
    const viewportWidth = window.innerWidth;

    // Flip above the icon when the panel would not fit underneath it.
    const below = rect.bottom + GAP + panelHeight;
    const flip = below > window.innerHeight - EDGE && rect.top > panelHeight;

    const top = flip ? rect.top - GAP - panelHeight : rect.bottom + GAP;

    // Keep the panel on screen horizontally, since a right-aligned icon would
    // otherwise push it off the side on a narrow phone.
    const maxLeft = Math.max(EDGE, viewportWidth - PANEL_WIDTH - EDGE);
    const left = Math.min(Math.max(EDGE, rect.left), maxLeft);

    setPlacement({ top, left });
  }, []);

  React.useEffect(() => {
    if (!open) return;

    measure();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
    };
  }, [open, measure]);

  function close(returnFocus = true) {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }

  function handlePick(dateKey: string) {
    onSelectDate(dateKey);
    close();
  }

  const canGoBack = firstKey !== null && monthOf(firstKey).key !== visible.key;
  const canGoForward = lastKey !== null && monthOf(lastKey).key !== visible.key;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Choose a pickup date from the calendar"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "hover:bg-accent grid size-8 shrink-0 place-items-center rounded-full transition-colors",
          "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
          open && "bg-accent",
        )}
      >
        <CalendarDays className="size-4" aria-hidden="true" />
      </button>

      {open ? (
        <>
          {/*
           * A transparent sheet rather than a click handler on the panel's
           * surroundings: it also swallows the scroll that would otherwise
           * happen behind the panel, and closes on any click outside the panel,
           * which is the behaviour people already expect from one.
           */}
          <button
            type="button"
            aria-label="Close the calendar"
            tabIndex={-1}
            onClick={() => close()}
            className="fixed inset-0 z-40 cursor-default"
          />

          <div
            ref={panelRef}
            role="dialog"
            aria-label="Pick a pickup date"
            style={{
              top: placement?.top ?? -9999,
              left: placement?.left ?? -9999,
              width: `min(${PANEL_WIDTH}px, calc(100vw - ${EDGE * 2}px))`,
            }}
            className={cn(
              "border-border bg-card fixed z-50 rounded-xl border p-4 shadow-lg",
              // Off-screen until the first measurement lands, so the panel never
              // flashes in the wrong corner on first paint.
              !placement && "invisible",
            )}
          >
            <div className="mb-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setVisible((current) => addMonths(current, -1))}
                disabled={!canGoBack}
                aria-label="Previous month"
                className={cn(
                  "hover:bg-accent grid size-8 place-items-center rounded-full transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  !canGoBack &&
                    "cursor-not-allowed opacity-30 hover:bg-transparent",
                )}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>

              <p aria-live="polite" className="text-sm font-semibold">
                {formatMonthYear(visible.year, visible.month)}
              </p>

              <button
                type="button"
                onClick={() => setVisible((current) => addMonths(current, 1))}
                disabled={!canGoForward}
                aria-label="Next month"
                className={cn(
                  "hover:bg-accent grid size-8 place-items-center rounded-full transition-colors",
                  "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                  !canGoForward &&
                    "cursor-not-allowed opacity-30 hover:bg-transparent",
                )}
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mb-1 grid grid-cols-7 gap-1">
              {WEEKDAY_INITIALS.map((initial, index) => (
                <span
                  key={`${initial}-${index}`}
                  aria-hidden="true"
                  className="text-muted-foreground text-center text-xs font-medium"
                >
                  {initial}
                </span>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((cell, index) => {
                if (cell.kind === "blank") {
                  return <span key={`blank-${index}`} aria-hidden="true" />;
                }

                const selected = cell.dateKey === selectedDate;

                return (
                  <button
                    key={cell.dateKey}
                    type="button"
                    disabled={!cell.available}
                    aria-pressed={selected}
                    aria-current={
                      cell.dateKey === todayKey ? "date" : undefined
                    }
                    aria-label={`${formatFullDate(cell.dateKey)}${
                      cell.available ? "" : ", unavailable"
                    }`}
                    onClick={() => handlePick(cell.dateKey)}
                    className={cn(
                      "grid aspect-square place-items-center rounded-lg text-sm transition-colors",
                      "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
                      selected
                        ? "bg-[var(--primary)] font-semibold text-[var(--primary-foreground)]"
                        : cell.available
                          ? "border-border border hover:bg-[var(--accent)]"
                          : "text-muted-foreground cursor-not-allowed opacity-35",
                      cell.dateKey === todayKey && !selected && "font-semibold",
                    )}
                  >
                    {cell.dayNumber}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
