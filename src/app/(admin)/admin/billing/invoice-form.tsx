"use client";

import { Loader2, Plus, ReceiptText, Trash2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input, Label } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BillableOrder } from "@/db/queries/billing";
import type { Service } from "@/db/types";
import { formatINR } from "@/lib/utils";

import { generateInvoiceAction } from "./actions";

type DraftLine = { key: string; serviceId: string; qty: number };

let nextKey = 0;
function lineKey() {
  nextKey += 1;
  return `line-${nextKey}`;
}

/**
 * The invoice item entry.
 *
 * A line is a service picked from the catalogue and a quantity. The price is not
 * typed here, and the server would ignore one if it were: `createInvoice` reads
 * the name and rate from `services`. The running total below uses the catalogue
 * prices the page already holds, purely so the admin can see the shape of the
 * bill before saving it.
 */
export function InvoiceForm({
  order,
  services,
  onGenerated,
  onCancel,
}: {
  order: BillableOrder;
  services: Service[];
  onGenerated: (message: string) => void;
  onCancel: () => void;
}) {
  const [lines, setLines] = React.useState<DraftLine[]>(() => [
    { key: lineKey(), serviceId: services[0]?.id ?? "", qty: 1 },
  ]);
  const [tax, setTax] = React.useState("0");
  const [discount, setDiscount] = React.useState("0");
  const [deliveryCharge, setDeliveryCharge] = React.useState("0");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const priceOf = (serviceId: string) =>
    services.find((service) => service.id === serviceId)?.price ?? 0;

  const subtotal = lines.reduce(
    (sum, line) => sum + line.qty * priceOf(line.serviceId),
    0,
  );

  const total = Math.max(
    0,
    subtotal +
      Number(tax || 0) +
      Number(deliveryCharge || 0) -
      Number(discount || 0),
  );

  function addLine() {
    setLines([
      ...lines,
      { key: lineKey(), serviceId: services[0]?.id ?? "", qty: 1 },
    ]);
  }

  function removeLine(key: string) {
    setLines(lines.filter((line) => line.key !== key));
  }

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines(
      lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    );
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (lines.length === 0) {
      setError("Add at least one service.");
      return;
    }

    startTransition(async () => {
      const result = await generateInvoiceAction({
        orderId: order.id,
        tax: Number(tax || 0),
        discount: Number(discount || 0),
        deliveryCharge: Number(deliveryCharge || 0),
        items: lines.map((line) => ({
          serviceId: line.serviceId,
          qty: line.qty,
        })),
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onGenerated(result.message ?? "Invoice generated.");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Billing <span className="font-mono">{order.order_no}</span> for{" "}
        {order.customer_name}.
      </p>

      {services.length === 0 ? (
        <p className="text-destructive text-sm">
          There are no active services to bill. Add one on Services and prices
          first.
        </p>
      ) : (
        <>
          <div className="space-y-3">
            {lines.map((line, index) => (
              <div key={line.key} className="flex items-end gap-2">
                <div className="min-w-0 flex-1 space-y-2">
                  <Label htmlFor={`service-${line.key}`}>
                    Service {index + 1}
                  </Label>
                  <Select
                    value={line.serviceId}
                    onValueChange={(value) =>
                      updateLine(line.key, { serviceId: value })
                    }
                  >
                    <SelectTrigger
                      id={`service-${line.key}`}
                      className="w-full"
                    >
                      <SelectValue placeholder="Choose a service" />
                    </SelectTrigger>
                    <SelectContent>
                      {services.map((service) => (
                        <SelectItem key={service.id} value={service.id}>
                          {service.name} — {formatINR(service.price)}/
                          {service.unit}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-24 space-y-2">
                  <Label htmlFor={`qty-${line.key}`}>Qty</Label>
                  <Input
                    id={`qty-${line.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.5"
                    value={line.qty}
                    disabled={isPending}
                    onChange={(event) =>
                      updateLine(line.key, {
                        qty: Number(event.target.value),
                      })
                    }
                    className="text-right tabular-nums"
                  />
                </div>

                <span className="w-24 pb-2 text-right text-sm tabular-nums">
                  {formatINR(line.qty * priceOf(line.serviceId))}
                </span>

                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove service ${index + 1}`}
                  onClick={() => removeLine(line.key)}
                  disabled={isPending || lines.length === 1}
                  className="mb-0.5"
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addLine}
            disabled={isPending}
          >
            <Plus aria-hidden />
            Add another service
          </Button>
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="invoice-tax">Tax (₹)</Label>
          <Input
            id="invoice-tax"
            type="number"
            min={0}
            step="0.01"
            value={tax}
            disabled={isPending}
            onChange={(event) => setTax(event.target.value)}
            className="text-right tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-discount">Discount (₹)</Label>
          <Input
            id="invoice-discount"
            type="number"
            min={0}
            step="0.01"
            value={discount}
            disabled={isPending}
            onChange={(event) => setDiscount(event.target.value)}
            className="text-right tabular-nums"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invoice-delivery">Delivery charge (₹)</Label>
          <Input
            id="invoice-delivery"
            type="number"
            min={0}
            step="0.01"
            value={deliveryCharge}
            disabled={isPending}
            onChange={(event) => setDeliveryCharge(event.target.value)}
            className="text-right tabular-nums"
          />
        </div>
      </div>

      <dl className="space-y-1 border-t border-[var(--border)] pt-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-muted-foreground">Subtotal</dt>
          <dd className="tabular-nums">{formatINR(subtotal)}</dd>
        </div>
        <div className="flex items-center justify-between text-base font-semibold">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatINR(total)}</dd>
        </div>
      </dl>

      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || services.length === 0}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <ReceiptText aria-hidden />
          )}
          Generate invoice
        </Button>
      </DialogFooter>
    </form>
  );
}
