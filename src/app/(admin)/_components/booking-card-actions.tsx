"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  FlaskConical,
  Loader2,
  MessageCircle,
  ReceiptText,
} from "lucide-react";

import { siteConfig } from "@/config/site";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  bookingCardActions,
  notificationForStatus,
  type AdminOrderRow,
} from "@/db/queries/admin-orders";
import type { Service } from "@/db/types";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";

import {
  generateBookingInvoiceAction,
  updateOrderStatusAction,
} from "../admin/bookings/actions";
import { InvoiceForm } from "../admin/billing/invoice-form";

/**
 * The two quick actions a booking card carries: confirm the product analysis,
 * then generate the invoice.
 *
 * Both are gated by `bookingCardActions`, which reads the booking's stage and
 * its invoice state, so the buttons tell the truth about why they are grey:
 * analysis is pressed from `picked_up`, invoicing from `under_analysis` with no
 * invoice yet. The database is still the authority — both dialogs send an
 * expected status and the state machine rejects an illegal move — but a grey
 * button with a reason beats a grey button an admin has to click to decode.
 */
export function BookingCardActions({
  row,
  services,
}: {
  row: AdminOrderRow;
  services: Service[];
}) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisButton row={row} onNotice={setNotice} />
        <InvoiceButton row={row} services={services} onNotice={setNotice} />
      </div>

      {notice ? (
        <p role="status" className="text-muted-foreground text-xs">
          {notice}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A plain textarea rather than a shared one, matching the stage dialog on the
 * booking detail page — same focus ring and border tokens, so the two confirm
 * dialogs read as one application.
 */
function Textarea({
  className,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={`border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 placeholder:text-muted-foreground min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${className ?? ""}`}
      {...props}
    />
  );
}

/**
 * Analysis on a card is a confirmation, not a status editor: the booking is at
 * `picked_up`, someone at the store has finished examining the laundry, and
 * pressing this records it — `under_analysis` on the timeline the customer and
 * the assigned agent both read. The optional note is the store's chance to say
 * what was found, which is why the dialog asks for it like the stage dialogs.
 */
function AnalysisButton({
  row,
  onNotice,
}: {
  row: AdminOrderRow;
  onNotice: (notice: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const gate = bookingCardActions({
    status: row.status,
    hasInvoice: row.hasInvoice,
  });
  const tells = notificationForStatus("under_analysis");

  function confirm() {
    setError(null);

    startTransition(async () => {
      const result = await updateOrderStatusAction({
        orderId: row.id,
        next: "under_analysis",
        expectedStatus: row.status,
        note,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      // Close only once the server has confirmed the stage move.
      setOpen(false);
      setNote("");
      onNotice?.(result.warning ?? "");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {gate.analysis === "done" ? (
        <Button size="sm" variant="outline" disabled>
          <Check aria-hidden />
          Analysis completed
        </Button>
      ) : (
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            disabled={gate.analysis === "locked" || isPending}
            title={gate.analysisReason ?? undefined}
          >
            <FlaskConical aria-hidden />
            Analysis
          </Button>
        </DialogTrigger>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirm analysis completed?</DialogTitle>
          <DialogDescription asChild>
            <p className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground">
                {INTERNAL_STATUS_LABEL[row.status]}
              </span>
              <ArrowRight
                className="text-muted-foreground size-3.5"
                aria-hidden
              />
              <span className="font-medium">
                {INTERNAL_STATUS_LABEL.under_analysis}
              </span>
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {tells.customerIsTold ? (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <MessageCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The customer will be messaged on WhatsApp:{" "}
              {tells.template.replace(/_/g, " ")}.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              This change does not message the customer, but the tracking
              timeline for the booking updates for the customer and the assigned
              staff.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor={`analysis-note-${row.id}`}>
              Process note (optional)
            </Label>
            <Textarea
              id={`analysis-note-${row.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Anything the next person should know"
              rows={3}
              maxLength={500}
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">
              Saved against this stage in the status log. Only staff and admins
              see it.
            </p>
          </div>

          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={isPending}
          >
            Cancel
          </Button>

          <Button type="button" onClick={confirm} disabled={isPending}>
            {isPending ? (
              <Loader2 className="animate-spin" aria-hidden />
            ) : null}
            {isPending ? "Saving..." : "Confirm analysis completed"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Invoicing from a card.
 *
 * The dialog hosts the same invoice form the Billing page uses — same catalogue
 * pricing, same server-side totals — prefilled with the services this booking
 * holds, and saved through the bookings action that also moves the booking to
 * Invoice sent so the customer's timeline keeps up.
 */
function InvoiceButton({
  row,
  services,
  onNotice,
}: {
  row: AdminOrderRow;
  services: Service[];
  onNotice: (notice: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const gate = bookingCardActions({
    status: row.status,
    hasInvoice: row.hasInvoice,
  });

  /*
   * Only lines that still name an active catalogue service are prefilled: the
   * invoice prices from `services` server-side, so a deactivated or missing
   * service cannot be carried into a draft without becoming unpriceable.
   */
  const bookedLines = row.items
    .filter(
      (item) =>
        item.service_id &&
        services.some((service) => service.id === item.service_id),
    )
    .map((item) => ({ serviceId: item.service_id as string, qty: item.qty }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {gate.invoice === "done" ? (
        <Button size="sm" variant="outline" disabled>
          <Check aria-hidden />
          Invoice generated
        </Button>
      ) : (
        <DialogTrigger asChild>
          <Button
            size="sm"
            disabled={gate.invoice === "locked"}
            title={gate.invoiceReason ?? undefined}
          >
            <ReceiptText aria-hidden />
            Generate invoice
          </Button>
        </DialogTrigger>
      )}

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate an invoice</DialogTitle>
          <DialogDescription>
            Priced from the catalogue for{" "}
            <span className="font-mono">{row.order_no}</span>. The delivery
            charge follows the store policy and can be overridden.
          </DialogDescription>
        </DialogHeader>

        {open ? (
          <InvoiceForm
            key={row.id}
            order={{
              id: row.id,
              order_no: row.order_no,
              customer_name: row.customer_name,
              status: row.status,
              created_at: row.created_at,
            }}
            services={services}
            initialLines={bookedLines}
            deliveryPolicy={siteConfig.deliveryPolicy}
            submitAction={generateBookingInvoiceAction}
            onGenerated={(message) => {
              setOpen(false);
              onNotice(message);
              router.refresh();
            }}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
