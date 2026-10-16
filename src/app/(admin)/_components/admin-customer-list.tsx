"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Search,
  X,
} from "lucide-react";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CUSTOMER_SORTS,
  customerFilterHref,
  pageWindow,
  type AdminCustomerRow,
  type CustomerFilter,
  type CustomerFilterResult,
} from "@/db/queries/admin-customers";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";
import { cn, formatDate } from "@/lib/utils";

import { StatusPill } from "./booking-detail-cards";

/**
 * The admin customers list (architecture doc, section 7.2.2).
 *
 * Replaces a four-column read-only table that capped at fifty rows, had no
 * search, no pagination and no way to open a customer.
 *
 * The toolbar is a plain form submitting GET rather than a set of client-side
 * state handlers, so every combination is a bookmarkable URL and the page works
 * before JavaScript arrives. The sort select navigates on change so it does not
 * feel like a 1998 form; the text search keeps an explicit button because
 * typing should not fire a query per keystroke.
 *
 * Cards rather than a table, matching the bookings list. Each row is a person
 * with a handful of facts and a link to their record, not a set of columns to
 * compare, and on a narrow screen a five-column table is either a horizontal
 * scroll or a squeezed grid where the mobile number is the first thing to
 * disappear.
 */
export function AdminCustomerList({
  result,
  filter,
}: {
  result: CustomerFilterResult;
  filter: CustomerFilter;
}) {
  const router = useRouter();

  const { rows, total, page, pageCount, hasPrevious, hasNext } = result;
  const filtering = Boolean(filter.search);

  function push(overrides: Partial<CustomerFilter>) {
    // Any control change resets to page 1. Staying on page 7 of a result that
    // now has two pages would show an empty grid and look like data loss.
    router.push(customerFilterHref(filter, { page: 1, ...overrides }));
  }

  return (
    <>
      <div className="space-y-3">
        <form
          action="/admin/customers"
          method="get"
          className="flex flex-wrap items-end gap-2"
        >
          <div className="relative min-w-56 flex-1">
            <label htmlFor="customer-search" className="sr-only">
              Search customers
            </label>
            <Search
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
              aria-hidden
            />
            <input
              id="customer-search"
              name="q"
              type="search"
              defaultValue={filter.search ?? ""}
              placeholder="Name, mobile, WhatsApp or email"
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-9 w-full rounded-md border py-1 pr-3 pl-9 text-sm shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none"
            />
          </div>

          <button
            type="submit"
            className="bg-primary text-primary-foreground hover:bg-primary/90 h-9 rounded-md px-4 text-sm font-medium transition-colors"
          >
            Search
          </button>

          {filtering ? (
            <Link
              href="/admin/customers"
              className="text-muted-foreground hover:text-foreground inline-flex h-9 items-center gap-1 text-sm"
            >
              <X className="size-3.5" aria-hidden />
              Clear
            </Link>
          ) : null}
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            label="Sort"
            value={filter.sort ?? "newest"}
            options={CUSTOMER_SORTS.map((entry) => entry.id)}
            labels={Object.fromEntries(
              CUSTOMER_SORTS.map((entry) => [entry.id, entry.label]),
            )}
            prefix={<ArrowUpDown className="size-3.5" aria-hidden />}
            onChange={(next) => push({ sort: next as CustomerFilter["sort"] })}
          />
        </div>
      </div>

      <p className="text-muted-foreground text-sm" aria-live="polite">
        {total === 0
          ? filtering
            ? "No customers match that search."
            : "No customers yet."
          : `Showing ${rows.length} of ${total} customer${total === 1 ? "" : "s"}.`}
      </p>

      {rows.length === 0 ? (
        <div className="border-border rounded-xl border border-dashed px-6 py-12 text-center">
          <Search
            className="text-muted-foreground mx-auto size-7"
            aria-hidden
          />
          <p className="mt-3 font-medium">
            {filtering ? "Nobody matches that search." : "No customers yet."}
          </p>
          <p className="text-muted-foreground mx-auto mt-1 max-w-sm text-sm">
            {filtering
              ? "Try a shorter fragment of the name or number."
              : "Accounts appear here the moment someone signs up, with no import step."}
          </p>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <CustomerCard key={row.id} row={row} />
          ))}
        </ul>
      )}

      {pageCount > 1 ? (
        <nav
          aria-label="Customer pages"
          className="flex flex-wrap items-center justify-between gap-3"
        >
          <Link
            href={customerFilterHref(filter, { page: page - 1 })}
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
                    href={customerFilterHref(filter, { page: candidate })}
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
            href={customerFilterHref(filter, { page: page + 1 })}
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
 * One customer, as a card.
 *
 * Ordered by what the counter actually asks: who is this, how do I reach them,
 * and have they ever booked. The booking roll-up sits in the footer so the cards
 * in a row line up on it, which makes the column scannable as a whole.
 */
function CustomerCard({ row }: { row: AdminCustomerRow }) {
  return (
    <li className="bg-card flex flex-col gap-4 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <Avatar size="lg">
          <AvatarFallback>{initialsOf(row.full_name)}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <Link
            href={`/admin/customers/${row.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {row.full_name}
          </Link>

          <p className="text-muted-foreground mt-0.5 flex items-center gap-1.5 text-xs">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden />
            Joined {formatDate(row.created_at)}
          </p>
        </div>

        {row.is_active ? null : (
          <Badge variant="secondary" className="shrink-0">
            Inactive
          </Badge>
        )}
      </div>

      <div className="space-y-2 text-sm">
        <p className="flex items-center gap-1.5">
          <Phone
            className="text-muted-foreground size-3.5 shrink-0"
            aria-hidden
          />
          <a
            href={`tel:${row.mobile}`}
            className="truncate underline-offset-4 hover:underline"
          >
            {row.mobile}
          </a>
        </p>

        <p className="text-muted-foreground flex items-center gap-1.5">
          <MessageCircle className="size-3.5 shrink-0" aria-hidden />
          {row.whatsapp_number ? (
            <a
              href={`https://wa.me/${row.whatsapp_number.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
              className="truncate underline-offset-4 hover:underline"
            >
              {row.whatsapp_number}
            </a>
          ) : (
            <span className="text-xs">
              No WhatsApp number
            </span>
          )}
        </p>

        {row.email ? (
          <p className="text-muted-foreground flex items-center gap-1.5">
            <Mail className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{row.email}</span>
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2 border-t pt-3">
        {row.orderCount === 0 ? (
          <Badge variant="secondary">
            <Package className="size-3" aria-hidden />
            No bookings yet
          </Badge>
        ) : (
          <>
            <Badge variant="outline">
              <Package className="size-3" aria-hidden />
              {row.orderCount} booking{row.orderCount === 1 ? "" : "s"}
            </Badge>

            {row.lastOrderStatus ? (
              <StatusPill
                status={row.lastOrderStatus}
                label={INTERNAL_STATUS_LABEL[row.lastOrderStatus]}
                className="shrink-0"
              />
            ) : null}

            <span className="text-muted-foreground text-xs">
              Last {formatDate(row.lastOrderAt)}
            </span>
          </>
        )}
      </div>
    </li>
  );
}

/** Up to two letters for the avatar, from a name that may be a single word. */
function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
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


