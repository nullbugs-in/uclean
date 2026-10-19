"use client";

import { Loader2, ReceiptText, Send, Wallet } from "lucide-react";
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
import type { BillableOrder, InvoiceRow } from "@/db/queries/billing";
import type { Service } from "@/db/types";
import { formatDate, formatINR } from "@/lib/utils";

import { recordCodAction, sendInvoiceAction } from "./actions";
import { InvoiceForm } from "./invoice-form";

/**
 * Billing (section 8.4 and 8.5).
 *
 * Two lists and the actions that move between them. An order with no invoice
 * can be billed; an invoice that is not yet paid can be sent or, on delivery,
 * marked collected as Cash on Delivery.
 *
 * Prices are never entered here. A line is a catalogue service, and the server
 * prices it, so the figures the customer is billed come from `services` and not
 * from this form.
 */
export function BillingPanel({
  invoices,
  billableOrders,
  services,
}: {
  invoices: InvoiceRow[];
  billableOrders: BillableOrder[];
  services: Service[];
}) {
  const [billing, setBilling] = React.useState<BillableOrder | null>(null);
  const [collecting, setCollecting] = React.useState<InvoiceRow | null>(null);
  const [sendingId, setSendingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function openBilling(order: BillableOrder) {
    setError(null);
    setNotice(null);
    setBilling(order);
  }

  function openCollect(invoice: InvoiceRow) {
    setError(null);
    setNotice(null);
    setCollecting(invoice);
  }

  function handleGenerated(message: string) {
    setBilling(null);
    setError(null);
    setNotice(message);
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
          <CardTitle className="text-base">Awaiting an invoice</CardTitle>
          <CardDescription>
            Open bookings with nothing billed against them yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {billableOrders.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Every open booking has an invoice.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b text-left text-xs">
                    <th className="pb-2 font-medium">Order</th>
                    <th className="pb-2 font-medium">Customer</th>
                    <th className="pb-2 font-medium">Placed</th>
                    <th className="pb-2 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {billableOrders.map((order) => (
                    <tr
                      key={order.id}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="py-2 pr-3 font-mono">{order.order_no}</td>
                      <td className="py-2 pr-3">{order.customer_name}</td>
                      <td className="text-muted-foreground py-2 pr-3">
                        {formatDate(order.created_at)}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          onClick={() => openBilling(order)}
                        >
                          <ReceiptText aria-hidden />
                          Generate invoice
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invoices</CardTitle>
          <CardDescription>
            Newest first. Send a payment link, or record the cash on delivery.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {invoices.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No invoices have been generated yet.
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
                              Settled
                            </span>
                          ) : (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleSend(invoice)}
                                disabled={
                                  isPending || sendingId === invoice.id
                                }
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
        open={billing !== null}
        onOpenChange={(open) => {
          if (!open) setBilling(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Generate an invoice</DialogTitle>
            <DialogDescription>
              Prices come from the services catalogue. Re-generating replaces the
              invoice and its lines.
            </DialogDescription>
          </DialogHeader>
          {billing ? (
            <InvoiceForm
              key={billing.id}
              order={billing}
              services={services}
              onGenerated={handleGenerated}
              onCancel={() => setBilling(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

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
              This records the cash on delivery against{" "}
              {collecting?.invoice_no} and marks the invoice paid. It cannot be
              undone from here.
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
