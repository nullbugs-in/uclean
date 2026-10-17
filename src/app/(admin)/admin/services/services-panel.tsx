"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Service } from "@/db/types";
import { formatINR } from "@/lib/utils";

import { deleteServiceAction } from "./actions";
import { ServiceForm } from "./service-form";

/**
 * The billing catalogue.
 *
 * The public price list is a separate, static file (`src/data/pricing.ts`), so a
 * change here does not move the marketing pages. What it moves is what an
 * invoice prices from.
 *
 * Deleting is offered but retiring is the safer tool: `order_items.service_id`
 * is `on delete set null`, so a delete drops the catalogue link from orders that
 * used the service, while a retire keeps it.
 */
export function ServicesPanel({ services }: { services: Service[] }) {
  const [editing, setEditing] = React.useState<Service | null>(null);
  const [isCreating, setIsCreating] = React.useState(false);
  const [deleting, setDeleting] = React.useState<Service | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const isFormOpen = isCreating || editing !== null;

  function closeForm() {
    setIsCreating(false);
    setEditing(null);
  }

  function openCreate() {
    setError(null);
    setNotice(null);
    setIsCreating(true);
  }

  function openEdit(service: Service) {
    setError(null);
    setNotice(null);
    setEditing(service);
  }

  function handleSaved(message: string) {
    closeForm();
    setError(null);
    setNotice(message);
  }

  function handleDelete() {
    if (!deleting) return;
    const target = deleting;
    setError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await deleteServiceAction(target.id);
      setDeleting(null);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      setNotice(result.message);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {services.length} service{services.length === 1 ? "" : "s"} on the
          catalogue.
        </p>
        <Button onClick={openCreate}>
          <Plus aria-hidden="true" />
          Add service
        </Button>
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

      {services.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No services yet. Add one, or run the seed to load the sample list.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left">
                <th className="p-3 font-medium">Service</th>
                <th className="p-3 font-medium">Unit</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr
                  key={service.id}
                  className="border-b border-[var(--border)] last:border-0"
                >
                  <td className="p-3">
                    <p className="font-medium">{service.name}</p>
                    {service.description ? (
                      <p className="text-muted-foreground">
                        {service.description}
                      </p>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground p-3">{service.unit}</td>
                  <td className="p-3 tabular-nums">{formatINR(service.price)}</td>
                  <td className="p-3">
                    {service.is_active ? (
                      <Badge variant="success">Active</Badge>
                    ) : (
                      <Badge variant="secondary">Retired</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openEdit(service)}
                      >
                        <Pencil aria-hidden="true" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(service)}
                        disabled={isPending}
                      >
                        <Trash2 aria-hidden="true" />
                        Delete
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog
        open={isFormOpen}
        onOpenChange={(open) => {
          if (!open) closeForm();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit service" : "Add a service"}
            </DialogTitle>
            <DialogDescription>
              This is the billing catalogue: invoices price from it. The public
              price list is maintained separately.
            </DialogDescription>
          </DialogHeader>
          {/* Remounted per service so the fields reset when the target changes. */}
          <ServiceForm
            key={editing?.id ?? "new"}
            service={editing ?? undefined}
            onSaved={handleSaved}
            onCancel={closeForm}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.name}?</DialogTitle>
            <DialogDescription>
              Orders that used this service keep their line items and their
              recorded price, but lose the link to the catalogue. Retiring it
              instead keeps that link.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleting(null)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isPending}
            >
              {isPending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Trash2 aria-hidden="true" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
