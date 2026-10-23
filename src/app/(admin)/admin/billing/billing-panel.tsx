"use client";

import Link from "next/link";
import {
  Eye,
  FileText,
  Loader2,
  ReceiptText,
  Search,
  Send,
  Wallet,
} from "lucide-react";
import * as React from "react";

import { InvoiceStatusBadge } from "@/components/panel/invoice-status-badge";
import { StatCard } from "@/components/panel/stat-card";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  INVOICE_FILTERS,
  INVOICE_FILTER_LABEL,
  applyInvoiceStatusFilter,
  countInvoices,
  invoiceFilterHref,
  matchesInvoiceSearch,
  searchTerms,
  type InvoiceRow,
  type InvoiceStatusFilter,
} from "@/db/queries/billing";
import { cn, formatDate, formatINR } from "@/lib/utils";

import { recordCodAction, sendInvoiceAction } from "./actions";

/**
 * Billing (section 8.4 and 8.5).
 *
 * The invoice history and the actions over it. Every bill the store has raised
 * — draft, sent, paid or void — lists here, because Billing is the only place
 * the complete ledger lives; invoices are generated from a booking card, so
 * there is no entry form on this page.
 */
export function BillingPanel({
  invoices,
  statusFilter,
}: {
  invoices: InvoiceRow[];
  /** The status chip the URL carries, already resolved to a real value. */
  statusFilter: InvoiceStatusFilter;
}) {
  const [search, setSearch] = React.useState("");
  const [collecting, setCollecting] = React.useState<InvoiceRow | null>(null);
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  /** The counts and the money read the whole history, whatever is filtered. */
  const counts = React.useMemo(() => countInvoices(invoices), [invoices]);

  const terms = React.useMemo(() => searchTerms(search), [search]);
  const visible = React.useMemo(
    () =>
      applyInvoiceStatusFilter(invoices, statusFilter).filter((row) =>
        matchesInvoiceSearch(row, terms),
      ),
    [invoices, statusFilter, terms],
  );

  function openCollect(invoice: InvoiceRow) {
    setError(null);
    setNotice(null);
    setCollecting(invoice);
  }

  function handleSend(invoice: InvoiceRow) {
    setError(null);
    setNotice(null);
    setSendingId(invoice.id);

    startTransition(async () => {
      const result = await sendInvoiceAction({
        invoiceId: invoice.id,
        orderId: invoice.order_id,
      });
      setSendingId(null);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
    });
  }

  function handleCollect() {
    if (!collecting) return;
    const target = collecting;
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await recordCodAction({
        invoiceId: target.id,
        orderId: target.order_id,
        amount: target.total,
      });
      setCollecting(null);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
    });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Invoices"
          value={counts.all}
          hint={`${formatINR(counts.billed)} billed · ${formatINR(counts.collected)} collected`}
          icon={ReceiptText}
        />
        <StatCard
          label="Draft"
          value={counts.draft}
          hint="Generated, not sent yet"
          icon={FileText}
        />
        <StatCard
          label="Sent"
          value={counts.sent}
          hint="Payment link is out"
          icon={Send}
        />
        <StatCard
          label="Paid"
          value={counts.paid}
          hint={`${formatINR(counts.collected)} collected`}
          icon={Wallet}
        />
      </div>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      {notice ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {notice}
        </p>
      ) : null}

      <nav
        aria-label="Filter invoices"
        className="flex flex-wrap items-center gap-2"
      >
        {INVOICE_FILTERS.map((id) => {
          const active = id === statusFilter;

          return (
            <Link
              key={id}
              href={invoiceFilterHref(id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1.5 text-sm transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground font-medium"
                  : "border-border hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {INVOICE_FILTER_LABEL[id]}
            </Link>
          );
        })}

        <label className="relative ml-auto w-full max-w-xs">
          <span className="sr-only">Search the invoice history</span>
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Invoice, order or customer"
            className="h-9 pl-8"
          />
        </label>
      </nav>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {statusFilter === "all"
              ? "Invoices"
              : `Invoices · ${INVOICE_FILTER_LABEL[statusFilter]}`}
          </CardTitle>
          <CardDescription>
            Newest first. Send a payment link, or record the cash on delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {visible.length === 0 ? (
            <div className="border-border rounded-xl border border-dashed px-6 py-12 text-center">
              <ReceiptText
                className="text-muted-foreground mx-auto size-7"
                aria-hidden
              />
              <p className="mt-3 font-medium">
                {invoices.length === 0
                  ? "No invoices have been generated yet."
                  : "Nothing matches the filters."}
              </p>
              <p className="text-muted-foreground mt-1 text-sm">
                {invoices.length === 0
                  ? "Raise one from the Generate invoice button on a booking card."
                  : "Try another status, or clear the search."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pr-3 pb-2 font-medium">Invoice</th>
                    <th className="pr-3 pb-2 font-medium">Order</th>
                    <th className="pr-3 pb-2 font-medium">Customer</th>
                    <th className="pr-3 pb-2 font-medium">Generated</th>
                    <th className="pr-3 pb-2 text-right font-medium">Total</th>
                    <th className="pr-3 pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((invoice) => {
                    const paid = invoice.status === "paid";

                    return (
                      <tr
                        key={invoice.id}
                        className="border-border/60 border-b last:border-0"
                      >
                        <td className="py-2 pr-3 font-mono">
                          {invoice.invoice_no}
                        </td>
                        <td className="py-2 pr-3 font-mono">
                          {invoice.order_no}
                        </td>
                        <td className="py-2 pr-3">{invoice.customer_name}</td>
                        <td className="text-muted-foreground py-2 pr-3">
                          {formatDate(invoice.created_at)}
                        </td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatINR(invoice.total)}
                        </td>
                        <td className="py-2 pr-3">
                          <InvoiceStatusBadge status={invoice.status} />
                        </td>
                        <td className="py-2 text-right">
                          {paid ? (
                            <div className="flex items-center justify-end gap-2">
                              {!invoice.pay_token ? null : (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="ghost"
                                  disabled={isPending}
                                >
                                  <Link
                                    href={`/pay/${invoice.pay_token}`}
                                    target="_blank"
                                  >
                                    <Eye aria-hidden />
                                    View
                                  </Link>
                                </Button>
                              )}
                              <span className="text-muted-foreground text-xs">
                                Settled
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-end gap-2">
                              {!invoice.pay_token ? null : (
                                <Button
                                  asChild
                                  size="sm"
                                  variant="ghost"
                                  disabled={isPending}
                                >
                                  <Link
                                    href={`/pay/${invoice.pay_token}`}
                                    target="_blank"
                                  >
                                    <Eye aria-hidden />
                                    View
                                  </Link>
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSend(invoice)}
                                disabled={isPending || sendingId === invoice.id}
                              >
                                {sendingId === invoice.id ? (
                                  <Loader2
                                    className="animate-spin"
                                    aria-hidden
                                  />
                                ) : (
                                  <Send aria-hidden />
                                )}
                                Send
                              </Button>
                              <Button
                                size="sm"
                                onClick={() => openCollect(invoice)}
                                disabled={isPending}
                              >
                                <Wallet aria-hidden />
                                Mark collected
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={collecting !== null}
        onOpenChange={(open) => {
          if (!open) setCollecting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Record {collecting ? formatINR(collecting.total) : ""} collected?
            </DialogTitle>
            <DialogDescription>
              This records the cash on delivery against {collecting?.invoice_no}{" "}
              and marks the invoice paid. It cannot be undone from here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCollecting(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleCollect} disabled={isPending}>
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : (
                <Wallet aria-hidden />
              )}
              Record payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
