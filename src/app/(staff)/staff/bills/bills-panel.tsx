"use client";

import { Loader2, Wallet } from "lucide-react";
import * as React from "react";

import { InvoiceStatusBadge } from "@/components/panel/invoice-status-badge";
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
import type { InvoiceRow } from "@/db/queries/billing";
import { formatDate, formatINR } from "@/lib/utils";

import { recordCodCollectedAction } from "./actions";

/**
 * The staff bill list (section 10).
 *
 * Read-only except for one thing: marking the cash collected on delivery. That
 * split is not a UI choice, it mirrors the policies - staff may insert a payment
 * for an order they are assigned to and may not touch the invoice itself.
 *
 * The list arrives already scoped by RLS, so there is no filter here to get
 * wrong.
 */
export function StaffBillsPanel({ invoices }: { invoices: InvoiceRow[] }) {
  const [collecting, setCollecting] = React.useState<InvoiceRow | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function openCollect(invoice: InvoiceRow) {
    setError(null);
    setNotice(null);
    setCollecting(invoice);
  }

  function handleCollect() {
    if (!collecting) return;
    const target = collecting;
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await recordCodCollectedAction({
        invoiceId: target.id,
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
    <div className="space-y-4">
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your bills</CardTitle>
          <CardDescription>
            Invoices for the orders you are assigned. Collect the cash on
            delivery and record it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              There are no bills on your orders yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 font-medium">Invoice</th>
                    <th className="pb-2 font-medium">Order</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 text-right font-medium">Total</th>
                    <th className="pb-2 font-medium">Status</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((invoice) => {
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
                        <td className="py-2 pr-3 text-right tabular-nums">
                          {formatINR(invoice.total)}
                        </td>
                        <td className="py-2 pr-3">
                          <InvoiceStatusBadge status={invoice.status} />
                        </td>
                        <td className="py-2 text-right">
                          {paid ? (
                            <span className="text-muted-foreground text-xs">
                              Collected{" "}
                              {invoice.paid_at
                                ? formatDate(invoice.paid_at)
                                : ""}
                            </span>
                          ) : (
                            <Button
                              size="sm"
                              onClick={() => openCollect(invoice)}
                              disabled={isPending}
                            >
                              <Wallet aria-hidden />
                              Mark collected
                            </Button>
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
              and marks the bill paid. It cannot be undone from here.
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
