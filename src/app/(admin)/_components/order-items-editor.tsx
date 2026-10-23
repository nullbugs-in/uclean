"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, Save, Undo2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { itemsTotal } from "@/db/queries/admin-orders";
import type { OrderItem } from "@/db/types";
import { formatINR } from "@/lib/utils";

import { updateOrderItemsAction } from "../admin/bookings/actions";

/**
 * The lines on a booking, editable while the admin is assessing the bag.
 *
 * A customer books a guess ("about 5 kg of wash and iron"). What comes back is a
 * weight, and the two rarely match, so the numbers have to be adjustable here.
 *
 * Two things this will not do:
 *
 *   - It never edits a line's name. What the customer asked for is the record;
 *     changing it here would make the booking disagree with what they chose.
 *   - It refuses entirely once an invoice exists. `createInvoice` deletes and
 *     replaces every `order_items` row for an order, so an edit made after
 *     billing would be silently thrown away. Better to lock than to let someone
 *     tune numbers that are about to stop existing.
 */
export function OrderItemsEditor({
  orderId,
  items,
  editable,
  lockedReason,
}: {
  orderId: string;
  items: OrderItem[];
  editable: boolean;
  lockedReason: string | null;
}) {
  const [drafts, setDrafts] = useState(() =>
    items.map((item) => ({
      id: item.id,
      qty: item.qty,
      unitPrice: item.unit_price,
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const liveTotal = itemsTotal(
    items.map((item) => {
      const draft = drafts.find((entry) => entry.id === item.id);
      return {
        ...item,
        qty: draft?.qty ?? item.qty,
        unit_price: draft?.unitPrice ?? item.unit_price,
      };
    }),
  );

  const savedTotal = itemsTotal(items);
  const dirty =
    liveTotal !== savedTotal ||
    drafts.some((draft) => {
      const item = items.find((entry) => entry.id === draft.id);
      return item
        ? item.qty !== draft.qty || item.unit_price !== draft.unitPrice
        : false;
    });

  function save() {
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await updateOrderItemsAction({ orderId, items: drafts });

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message ?? "Saved.");
    });
  }

  function reset() {
    setDrafts(
      items.map((item) => ({
        id: item.id,
        qty: item.qty,
        unitPrice: item.unit_price,
      })),
    );
    setError(null);
    setNotice(null);
  }

  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No services were recorded against this booking. A booking written
          before services were captured, or one whose service write failed,
          looks like this.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs">
                  <th scope="col" className="pb-2 font-medium">
                    Service
                  </th>
                  <th scope="col" className="w-24 pb-2 text-right font-medium">
                    Qty
                  </th>
                  <th scope="col" className="w-32 pb-2 text-right font-medium">
                    Rate
                  </th>
                  <th scope="col" className="w-28 pb-2 text-right font-medium">
                    Amount
                  </th>
                </tr>
              </thead>

              <tbody>
                {items.map((item) => {
                  const draft = drafts.find((entry) => entry.id === item.id);

                  return (
                    <tr
                      key={item.id}
                      className="border-border/60 border-b last:border-0"
                    >
                      <td className="py-2 pr-3">{item.item_name}</td>

                      <td className="py-2 text-right">
                        {editable ? (
                          <>
                            <label
                              htmlFor={`qty-${item.id}`}
                              className="sr-only"
                            >
                              Quantity of {item.item_name}
                            </label>
                            <Input
                              id={`qty-${item.id}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="0.5"
                              value={draft?.qty ?? item.qty}
                              disabled={isPending}
                              onChange={(event) =>
                                setDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          qty: Number(event.target.value),
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              className="h-9 text-right tabular-nums"
                            />
                          </>
                        ) : (
                          <span className="tabular-nums">{item.qty}</span>
                        )}
                      </td>

                      <td className="py-2 text-right">
                        {editable ? (
                          <>
                            <label
                              htmlFor={`rate-${item.id}`}
                              className="sr-only"
                            >
                              Rate for {item.item_name}
                            </label>
                            <Input
                              id={`rate-${item.id}`}
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="1"
                              value={draft?.unitPrice ?? item.unit_price}
                              disabled={isPending}
                              onChange={(event) =>
                                setDrafts((current) =>
                                  current.map((entry) =>
                                    entry.id === item.id
                                      ? {
                                          ...entry,
                                          unitPrice: Number(event.target.value),
                                        }
                                      : entry,
                                  ),
                                )
                              }
                              className="h-9 text-right tabular-nums"
                            />
                          </>
                        ) : (
                          <span className="tabular-nums">
                            {formatINR(item.unit_price)}
                          </span>
                        )}
                      </td>

                      <td className="text-muted-foreground py-2 text-right tabular-nums">
                        {formatINR(
                          (draft?.qty ?? item.qty) *
                            (draft?.unitPrice ?? item.unit_price),
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm">
              <span className="text-muted-foreground">Estimated total </span>
              <span className="font-semibold tabular-nums">
                {formatINR(liveTotal)}
              </span>
              {dirty ? (
                <span className="text-muted-foreground ml-2 text-xs">
                  unsaved
                </span>
              ) : null}
            </p>

            {editable ? (
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={reset}
                  disabled={isPending || !dirty}
                >
                  <Undo2 aria-hidden />
                  Reset
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={save}
                  disabled={isPending || !dirty}
                >
                  {isPending ? (
                    <Loader2 className="animate-spin" aria-hidden />
                  ) : (
                    <Save aria-hidden />
                  )}
                  Save changes
                </Button>
              </div>
            ) : null}
          </div>
        </>
      )}

      {!editable && lockedReason ? (
        <p className="text-muted-foreground flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {lockedReason}
        </p>
      ) : null}

      {editable ? (
        <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
          <Badge variant="warning">Estimate</Badge>
          Adjust these after weighing the bag. They become the billed amounts
          once an invoice is generated.
        </p>
      ) : null}

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
    </div>
  );
}
