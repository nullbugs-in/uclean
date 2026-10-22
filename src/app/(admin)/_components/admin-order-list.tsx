"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  UserRound,
  X,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { statusProgress } from "@/components/panel/cycle-meter";
import {
  ASSIGNMENT_FILTERS,
  ORDER_SORTS,
  STATUS_GROUPS,
  filterHref,
  pageWindow,
  type AdminOrderRow,
  type BookingFilterResult,
  type OrderFilter,
} from "@/db/queries/admin-orders";
import type { Service } from "@/db/types";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { cn, formatDate } from "@/lib/utils";

import { ProgressStrip, StatusPill } from "./booking-detail-cards";
import { BookingCardActions } from "./booking-card-actions";

const ASSIGNMENT_LABEL: Record<string, string> = {
  all: "Any assignment",
  assigned: "Has an agent",
  unassigned: "Needs an agent",
};

/**
 * The admin bookings list.
 *
 * Every booking, in every state. Replaces a page that rendered the staff pickup
 * list with `type="pickup"`, which meant delivery-leg bookings, anything
 * delivered and anything cancelled were all invisible here — and it reached
 * across route groups into a staff-owned component to do it. This reads `orders`
 * directly, so admin sees what admin should see.
 *
 * The toolbar is a plain form submitting GET rather than a set of client-side
 * state handlers, so every combination is a bookmarkable URL and the page works
 * before JavaScript arrives. The selects submit on change via the router so they
 * do not feel like a 1998 form; the text search keeps an explicit button because
 * typing should not fire a query per keystroke.
 */
export function AdminOrderList({
  result,
  filter,
  services,
}: {
  result: BookingFilterResult;
  filter: OrderFilter;
  /** The active catalogue, behind the card's Generate invoice dialog. */
  services: Service[];
}) {
  const router = useRouter();

  const { rows, total, page, pageCount, hasPrevious, hasNext, truncated } =
    result;
  const filtering =
    Boolean(filter.status) ||
    Boolean(filter.search) ||
    Boolean(filter.pickupFrom) ||
    Boolean(filter.pickupTo) ||
    (filter.assignment ?? "all") !== "all" ||
    false;

  function push(overrides: Partial<OrderFilter>) {
    // Any control change resets to page 1. Staying on page 7 of a result that now
    // has two pages would show an empty table and look like data loss.
    router.push(filterHref(filter, { page: 1, ...overrides }));
  }

  return (
    <>
      <div className="space-y-3">
        <form
          action="/admin/bookings"
          method="get"
          className="flex flex-wrap items-end gap-2"
        >
          <div className="relative min-w-56 flex-1">
            <label htmlFor="booking-search" className="sr-only">
              Search bookings
            </label>
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <input
              id="booking-search"
              name="q"
              type="search"
              defaultValue={filter.search ?? ""}
              placeholder="Order number, name or mobile"
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border py-1 pr-3 pl-9 text-sm shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            />
          </div>

          <DateField
            label="Pickup from"
            name="from"
            value={filter.pickupFrom}
          />
          <DateField label="Pickup to" name="to" value={filter.pickupTo} />

          {/* Carried through a submit so a date search does not silently drop the
              status filter it was combined with. */}
          {filter.status ? (
            <input type="hidden" name="status" value={filter.status} />
          ) : null}
          {filter.assignment && filter.assignment !== "all" ? (
            <input type="hidden" name="assignment" value={filter.assignment} />
          ) : null}

          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium transition-colors"
          >
            Search
          </button>

          {filtering ? (
            <Link
              href="/admin/bookings"
              className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-1 text-sm"
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Link>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Assignment"
            value={filter.assignment ?? "all"}
            options={ASSIGNMENT_FILTERS}
            labels={ASSIGNMENT_LABEL}
            onChange={(next) =>
              push({ assignment: next as OrderFilter["assignment"] })
            }
          />

          <FilterSelect
            label="Sort"
            value={filter.sort ?? "newest"}
            options={ORDER_SORTS.map((entry) => entry.id)}
            labels={Object.fromEntries(
              ORDER_SORTS.map((entry) => [entry.id, entry.label]),
            )}
            prefix={<ArrowUpDown className="size-3.5" aria-hidden />}
            onChange={(next) => push({ sort: next as OrderFilter["sort"] })}
          />
        </div>

        <nav
          aria-label="Filter bookings by status"
          className="flex flex-wrap items-center gap-2"
        >
          {STATUS_GROUPS.map((group) => {
            const active = (filter.status ?? "") === group.id;

            return (
              <Link
                key={group.id || "all"}
                href={filterHref(filter, { status: group.id, page: 1 })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-primary bg-primary text-primary-foreground font-medium"
                    : "border-border hover:bg-accent hover:text-accent-foreground",
                )}
              >
                {group.label}
              </Link>
            );
          })}
        </nav>
      </div>

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {total === 0
          ? filtering
            ? "No bookings match these filters."
            : "No bookings yet."
          : `Showing ${rows.length} of ${total} booking${total === 1 ? "" : "s"}.`}
        {truncated ? " The list was cut off at the newest 5000." : ""}
      </p>

      {rows.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed px-6 py-12 text-center">
          <Search
            className="text-muted-foreground mx-auto size-7"
            aria-hidden
          />
          <p className="mt-3 font-medium">
            {filtering ? "Nothing matches those filters." : "No bookings yet."}
          </p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            {filtering
              ? "Try the All filter, or search a shorter fragment of the order number."
              : "Bookings placed in the customer booking form appear here the moment they are placed."}
          </p>
        </div>
      ) : (
        /*
         * Cards rather than a table. The queue is read row by row and each row is
         * a job with five facts on it, not a set of columns to compare — and on a
         * narrow screen a six-column table is either a horizontal scroll or a
         * squeezed grid where the status is the first thing to disappear. Cards
         * reflow instead, and the status stays visible on every one.
         */
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <BookingCard key={row.id} row={row} services={services} />
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Booking pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Link
            href={filterHref(filter, { page: page - 1 })}
            aria-disabled={!hasPrevious}
            className={cn(
              "inline-flex items-center gap-1 text-sm",
              hasPrevious
                ? "hover:text-foreground"
                : "text-muted-foreground pointer-events-none opacity-50",
            )}
          >
            <ChevronLeft className="size-4" aria-hidden />
            Previous
          </Link>

          <div className="flex flex-wrap items-center gap-1">
            {pageWindow(page, pageCount).map((candidate, index, all) => {
              const previousPage = index > 0 ? all[index - 1] : undefined;

              return (
                <span key={candidate} className="flex items-center gap-1">
                  {previousPage !== undefined &&
                  candidate - previousPage > 1 ? (
                    <span className="text-muted-foreground px-1 text-sm">
                      …
                    </span>
                  ) : null}

                  <Link
                    href={filterHref(filter, { page: candidate })}
                    aria-current={candidate === page ? "page" : undefined}
                    className={cn(
                      "grid size-8 place-items-center rounded-md text-sm transition-colors",
                      candidate === page
                        ? "bg-primary text-primary-foreground font-medium"
                        : "hover:bg-accent hover:text-accent-foreground",
                    )}
                  >
                    {candidate}
                  </Link>
                </span>
              );
            })}
          </div>

          <Link
            href={filterHref(filter, { page: page + 1 })}
            aria-disabled={!hasNext}
            className={cn(
              "inline-flex items-center gap-1 text-sm",
              hasNext
                ? "hover:text-foreground"
                : "text-muted-foreground pointer-events-none opacity-50",
            )}
          >
            Next
            <ChevronRight className="size-4" aria-hidden />
          </Link>
        </nav>
      ) : null}
    </>
  );
}

/**
 * One booking, as a card.
 *
 * Laid out in the order the queue is worked: identify it, see how far along it
 * is, then the five facts that decide what to do with it — who, when, what, and
 * whether anyone has it. The two store-side quick actions (Analysis, Generate
 * invoice) sit with them, and the progress bar closes the card as a footer so
 * every card in a row lines up on it, which makes the column scannable as a
 * whole.
 */
function BookingCard({
  row,
  services,
}: {
  row: AdminOrderRow;
  services: Service[];
}) {
  return (
    <li className="bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href={`/admin/bookings/${row.id}`}
            className="font-mono font-medium underline-offset-4 hover:underline"
          >
            {row.order_no}
          </Link>
          <p className="text-muted-foreground mt-0.5 text-xs">
            Placed {formatDate(row.created_at)}
          </p>
        </div>

        <StatusPill
          status={row.status}
          label={INTERNAL_STATUS_LABEL[row.status]}
          className="shrink-0"
        />
      </div>

      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-1.5">
          <UserRound
            className="text-muted-foreground size-3.5 shrink-0"
            aria-hidden
          />
          <span className="truncate font-medium">{row.customer_name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {row.customer_mobile}
          </span>
        </p>

        <p className="text-muted-foreground flex items-center gap-1.5">
          <CalendarDays className="size-3.5 shrink-0" aria-hidden />
          <span>{formatDate(row.pickup_slot_date)}</span>
          <span className="truncate text-xs">
            {row.slotLabel ?? "No slot recorded"}
          </span>
        </p>

        <p className="text-muted-foreground flex items-center gap-1.5">
          <Package className="size-3.5 shrink-0" aria-hidden />
          {row.itemCount === 0 ? (
            <span className="text-xs">No services recorded</span>
          ) : (
            <>
              <span className="truncate">{row.items[0]?.item_name}</span>
              {row.itemCount > 1 ? (
                <span className="shrink-0 text-xs">
                  +{row.itemCount - 1} more
                </span>
              ) : null}
            </>
          )}
        </p>
      </div>

      <div className="mt-auto space-y-3">
        {row.pickupAgentName ? (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <UserRound className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{row.pickupAgentName}</span>
            {row.deliveryAgentName ? (
              <span className="truncate">
                → out with {row.deliveryAgentName}
              </span>
            ) : null}
          </p>
        ) : (
          <Badge variant="warning">Needs a pickup agent</Badge>
        )}

        <BookingCardActions row={row} services={services} />

        <ProgressStrip
          status={row.status}
          label="Progress"
          progress={statusProgress(row.status)}
        />
      </div>
    </li>
  );
}

/**
 * A select that navigates rather than submits.
 *
 * Built on the shared Select so it matches every other dropdown and inherits the
 * focus ring, rather than a bare `<select>` that would look like it came from a
 * different application.
 */
function FilterSelect({
  label,
  value,
  options,
  labels,
  prefix,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly string[];
  labels: Record<string, string>;
  prefix?: React.ReactNode;
  onChange: (next: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className="min-w-40" aria-label={label}>
        {prefix}
        <SelectValue />
      </SelectTrigger>

      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {labels[option] ?? option}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DateField({
  label,
  name,
  value,
}: {
  label: string;
  name: string;
  value: string | undefined;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={name} className="text-muted-foreground block text-xs">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type="date"
        defaultValue={value ?? ""}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 rounded-md border px-2 text-sm shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
      />
    </div>
  );
}
