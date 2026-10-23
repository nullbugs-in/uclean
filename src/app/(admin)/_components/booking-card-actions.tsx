"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  Loader2,
  MessageCircle,
  PackageCheck,
  ReceiptText,
  Send,
  Shirt,
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
  markBookingReadyAction,
  sendBookingInvoiceAction,
  updateOrderStatusAction,
} from "../admin/bookings/actions";
import { BookingInvoiceForm } from "./booking-invoice-form";

/**
 * The four quick actions a booking card carries are documented on
 * `BookingCardActions` below. Their shared styling lives here first: exactly
 * one button is the next step the card is asking for, and that is the one that
 * glows — a lime gradient with the CTA glow the landing page uses. Every other
 * enabled action stays a quiet outline so the pipeline, not equally-loud
 * buttons, decides where to look.
 */

/** The emphasised treatment: gradient lime + glow + lift, like the landing CTA. */
const NEXT_STEP_CTA =
  "bg-gradient-to-br from-[var(--primary)] to-[color-mix(in_oklab,var(--primary),var(--primary-foreground)_22%)] text-[var(--primary-foreground)] shadow-[0_8px_24px_-8px_var(--primary)] transition-all hover:-translate-y-0.5";

/** Flow order, so exactly one enabled action is ever pointed at. */
const FLOW_ORDER = ["analysis", "invoice", "send", "ready"] as const;

type FlowKey = (typeof FLOW_ORDER)[number];

/**
 * Which button is the booking's next step: the first one the gate calls ready,
 * reading down the stage order. When nothing is ready — an early booking or a
 * cancelled one — no button glows and the greys speak for themselves.
 */
export function nextStepOf(
  gate: Record<FlowKey, "locked" | "ready" | "done">,
): FlowKey | null {
  return FLOW_ORDER.find((step) => gate[step] === "ready") ?? null;
}

/** Shared tailwind for every glow button so the emphasis reads as one style. */
function emphasised(emphasis: boolean, className?: string) {
  return emphasis ? `${className ?? ""} ${NEXT_STEP_CTA}` : className;
}

/**
 * The four quick actions a booking card carries: confirm the product analysis,
 * then generate the invoice, then send it to the customer, then — once Billing
 * has confirmed the payment — mark the laundry ready for delivery.
 *
 * All are gated by `bookingCardActions`, which reads the booking's stage and
 * its invoice state, so the buttons tell the truth about why they are grey:
 * analysis is pressed from `picked_up`, invoicing from `under_analysis` with no
 * invoice yet, sending on a generated-but-unsent invoice, and ready on a paid
 * one. The database is still the authority — the dialogs send an expected
 * status and the invoices update is guarded server-side — but a grey button
 * with a reason beats a grey button an admin has to click to decode.
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
  const gate = bookingCardActions({
    status: row.status,
    hasInvoice: row.hasInvoice,
    invoiceStatus: row.invoiceStatus,
  });
  const next = nextStepOf(gate);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <AnalysisButton
          row={row}
          onNotice={setNotice}
          emphasised={next === "analysis"}
        />
        <InvoiceButton
          row={row}
          pricing={pricing}
          onNotice={setNotice}
          emphasised={next === "invoice"}
        />
        <ReadyButton
          row={row}
          onNotice={setNotice}
          emphasised={next === "ready"}
        />
        <SendInvoiceButton
          row={row}
          onNotice={setNotice}
          emphasised={next === "send"}
        />
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
  emphasised: emphasis,
}: {
  row: AdminOrderRow;
  onNotice: (notice: string) => void;
  /** True when this is the card's glowing next-step button. */
  emphasised: boolean;
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
            variant={emphasis ? "default" : "outline"}
            className={emphasised(emphasis)}
            disabled={gate.analysis === "locked" || isPending}
            title={gate.analysisReason ?? undefined}
          >
            <Shirt aria-hidden />
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
  emphasised: emphasis,
}: {
  row: AdminOrderRow;
  /** The DB price list pair, passed through to the invoice form. */
  pricing: PricingCatalogPair;
  onNotice: (notice: string) => void;
  /** True when this is the card's glowing next-step button. */
  emphasised: boolean;
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
            variant={emphasis ? "default" : "outline"}
            className={emphasised(emphasis)}
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
        <DialogHeader className="border-primary/15 from-primary/10 via-secondary/50 relative shrink-0 space-y-0 overflow-hidden border-b bg-gradient-to-br to-transparent px-5 py-4 pr-14 text-left">
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
 * Marking the laundry ready from a card.
 *
 * This is the moment the store is telling the customer and the assigned staff
 * that the processing is finished and the product can leave — but the shop's
 * rule is that nothing is ready on an unpaid invoice. The gate only opens on a
 * `paid` invoice, and the action walks the intermediate hops (recording
 * "Payment confirmed" where it lands on one) so the timeline and the status
 * log show exactly how the booking got to ready. Confirming the payment stage
 * on the way queues the payment-received WhatsApp; the ready stage itself
 * speaks through the tracking timeline, customers and staff both read.
 */
function ReadyButton({
  row,
  onNotice,
  emphasised: emphasis,
}: {
  row: AdminOrderRow;
  onNotice: (notice: string) => void;
  /** True when this is the card's glowing next-step button. */
  emphasised: boolean;
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

  /*
   * Starting the walk from `invoice_sent` or `payment_pending` lands on the
   * `paid` hop first, and that hop queues the customer's payment-received
   * message; from anywhere else the change is timeline-only. Saying which is
   * which beats a generic disclaimer.
   */
  const confirmsPayment =
    row.status === "invoice_sent" || row.status === "payment_pending";
  const tells = notificationForStatus("paid");

  function confirm() {
    setError(null);

    startTransition(async () => {
      const result = await markBookingReadyAction({
        orderId: row.id,
        expectedStatus: row.status,
      });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setOpen(false);
      onNotice(result.message ?? result.warning ?? "");
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {gate.ready === "done" ? (
        <Button size="sm" variant="outline" disabled>
          <Check aria-hidden />
          Ready
        </Button>
      ) : (
        <DialogTrigger asChild>
          <Button
            size="sm"
            variant={emphasis ? "default" : "outline"}
            className={emphasised(emphasis)}
            disabled={gate.ready === "locked"}
            title={gate.readyReason ?? undefined}
          >
            <PackageCheck aria-hidden />
            Mark ready
          </Button>
        </DialogTrigger>
      )}

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Mark the laundry ready for delivery?</DialogTitle>
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
                {INTERNAL_STATUS_LABEL.ready_for_delivery}
              </span>
            </p>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {confirmsPayment ? (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
              <MessageCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Confirming the payment first queues a WhatsApp message for the
              customer: {tells.template.replace(/_/g, " ")}. The tracking
              timeline then updates to Ready for delivery for the customer and
              the assigned staff.
            </p>
          ) : (
            <p className="text-muted-foreground text-xs">
              The tracking timeline updates to Ready for delivery for the
              customer and the assigned staff.
            </p>
          )}

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
              <PackageCheck aria-hidden />
            )}
            {isPending ? "Marking ready..." : "Mark ready"}
          </Button>
        </DialogFooter>
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
  emphasised: emphasis,
}: {
  row: AdminOrderRow;
  onNotice: (notice: string) => void;
  /** True when this is the card's glowing next-step button. */
  emphasised: boolean;
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
          <Button
            size="sm"
            variant={emphasis ? "default" : "outline"}
            className={emphasised(emphasis)}
          >
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
