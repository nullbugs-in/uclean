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
  Send,
} from "lucide-react";

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
import type { PricingCatalogPair } from "@/lib/pricing-options";
import { INTERNAL_STATUS_LABEL } from "@/lib/order-status";

import {
  sendBookingInvoiceAction,
  updateOrderStatusAction,
} from "../admin/bookings/actions";
import { BookingInvoiceForm } from "./booking-invoice-form";

/**
 * The three quick actions a booking card carries: confirm the product analysis,
 * then generate the invoice, then send it to the customer.
 *
 * All are gated by `bookingCardActions`, which reads the booking's stage and
 * its invoice state, so the buttons tell the truth about why they are grey:
 * analysis is pressed from `picked_up`, invoicing from `under_analysis` with no
 * invoice yet, and sending on a generated-but-unsent invoice. The database is
 * still the authority — the dialogs send an expected status and the invoices
 * update is guarded server-side — but a grey button with a reason beats a
 * grey button an admin has to click to decode.
 */
export function BookingCardActions({
  row,
  pricing,
}: {
  row: AdminOrderRow;
  /** The DB price list pair, read once by the page that renders this card. */
  pricing: PricingCatalogPair;
}) {
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisButton row={row} onNotice={setNotice} />
        <InvoiceButton row={row} pricing={pricing} onNotice={setNotice} />
        <SendInvoiceButton row={row} onNotice={setNotice} />
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
              Findings / feedback (optional)
            </Label>
            <Textarea
              id={`analysis-note-${row.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What the analysis found on the items"
              rows={3}
              maxLength={500}
              disabled={isPending}
            />
            <p className="text-muted-foreground text-xs">
              Saved against this stage in the status log, and prefilled in the
              invoice form&apos;s feedback field.
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
 * The dialog hosts the booking's own invoice form — priced from the store's
 * Book Now price list, prefilled with the services this booking holds and the
 * analysis findings — and saved through the bookings action that also moves the
 * booking to Invoice sent so the customer's timeline keeps up. Generation mints
 * the booking's secure invoice link; the form keeps the dialog open on a
 * receipt showing it, and the dispatcher below sends it to the customer.
 */
function InvoiceButton({
  row,
  pricing,
  onNotice,
}: {
  row: AdminOrderRow;
  /** The DB price list pair, passed through to the invoice form. */
  pricing: PricingCatalogPair;
  onNotice: (notice: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const gate = bookingCardActions({
    status: row.status,
    hasInvoice: row.hasInvoice,
    invoiceStatus: row.invoiceStatus,
  });

  /*
   * The opening line-up is what the booking recorded — the price-list items the
   * customer chose, at the figures they were quoted. The form itself matches
   * those names against the store's price list; lines it cannot match stay as
   * booked, still priceable.
   */
  const bookedLines = row.items.map((item) => ({
    name: item.item_name,
    qty: item.qty,
    unitPrice: item.unit_price,
  }));

  function handleGenerated(invoiceNo: string) {
    // The list behind the dialog must catch up with the invoice that now
    // exists, or a second press would offer to generate it again.
    router.refresh();
    onNotice(`${invoiceNo} generated. The secure link is ready in the dialog.`);
  }

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

      {/*
        The dialog is a card: the header band and the action footer stay pinned
        to the edges while the body scrolls between them, so a booking with many
        lines can never push the form past the viewport (the overlap that grid
        + no height cap produced).
      */}
      <DialogContent className="flex max-h-[calc(100vh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-primary/15 relative shrink-0 space-y-0 overflow-hidden border-b bg-gradient-to-br from-primary/10 via-secondary/50 to-transparent px-5 py-4 pr-14 text-left">
          <span
            aria-hidden
            className="bg-primary/20 pointer-events-none absolute -top-8 -right-8 size-24 rounded-full blur-xl"
          />
          <div className="flex items-center gap-3">
            <span className="bg-primary text-primary-foreground grid size-10 shrink-0 place-items-center rounded-xl shadow-sm">
              <ReceiptText className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 space-y-0.5">
              <DialogTitle>Generate an invoice</DialogTitle>
              <DialogDescription>
                Store price list ·{" "}
                <span className="font-mono">{row.order_no}</span> · delivery by
                policy, each line&apos;s price adjustable
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {open ? (
          <BookingInvoiceForm
            key={row.id}
            order={{
              id: row.id,
              order_no: row.order_no,
              customer_name: row.customer_name,
              status: row.status,
              created_at: row.created_at,
            }}
            pricing={pricing}
            bookedLines={bookedLines}
            feedback={row.analysisNote}
            onGenerated={handleGenerated}
            onCancel={() => setOpen(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Sending from a card, once the invoice exists.
 *
 * Sending is the customer-facing moment — the link goes live on the booking
 * card and a WhatsApp message is queued — so it gets a confirmation dialog the
 * same way a stage change does. The secure link itself already exists from
 * generation; sending reuses it rather than minting another.
 */
function SendInvoiceButton({
  row,
  onNotice,
}: {
  row: AdminOrderRow;
  onNotice: (notice: string) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const gate = bookingCardActions({
    status: row.status,
    hasInvoice: row.hasInvoice,
    invoiceStatus: row.invoiceStatus,
  });

  if (gate.send === "locked") return null;

  function confirm() {
    setError(null);

    startTransition(async () => {
      const result = await sendBookingInvoiceAction({ orderId: row.id });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOpen(false);
      onNotice(result.warning ?? result.message ?? "Invoice sent.");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {gate.send === "done" ? (
        <Button size="sm" variant="outline" disabled>
          <Check aria-hidden />
          Invoice sent
        </Button>
      ) : (
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <Send aria-hidden />
            Send to customer
          </Button>
        </DialogTrigger>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send the invoice to the customer?</DialogTitle>
          <DialogDescription>
            The secure invoice link goes live on the customer&apos;s booking and
            a WhatsApp message carrying it is prepared for the customer&apos;s
            registered number.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
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
            ) : (
              <Send aria-hidden />
            )}
            {isPending ? "Sending..." : "Send invoice"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
