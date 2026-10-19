"use client";

import { Loader2, Save } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { Service } from "@/db/types";

import { createServiceAction, updateServiceAction } from "./actions";

/**
 * The create/edit form inside the services dialog.
 *
 * `isActive` is held in state rather than left to `FormData` because the Radix
 * `Switch` is a button in the DOM and carries no value. Everything else comes
 * from the form itself.
 *
 * Blank optionals are sent as `null`, and a blank price as `NaN`, so "empty" is
 * a validation complaint rather than a silent 0. The action re-validates every
 * field; parsing here is only so a typo gets an immediate, local complaint.
 */
export function ServiceForm({
  service,
  onSaved,
  onCancel,
}: {
  service?: Service;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const [isActive, setIsActive] = React.useState(service?.is_active ?? true);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const data = new FormData(event.currentTarget);
    const price = String(data.get("price") ?? "").trim();
    const sortOrder = String(data.get("sortOrder") ?? "").trim();
    const description = String(data.get("description") ?? "").trim();
    const imageUrl = String(data.get("imageUrl") ?? "").trim();

    const input = {
      name: String(data.get("name") ?? ""),
      description: description === "" ? null : description,
      unit: String(data.get("unit") ?? ""),
      price: price === "" ? Number.NaN : Number(price),
      imageUrl: imageUrl === "" ? null : imageUrl,
      isActive,
      sortOrder: sortOrder === "" ? 0 : Number(sortOrder),
    };

    startTransition(async () => {
      const result = service
        ? await updateServiceAction(service.id, input)
        : await createServiceAction(input);

      if (!result.ok) {
        setError(result.message);
        return;
      }

      onSaved(result.message);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="service_name">Name</Label>
        <Input
          id="service_name"
          name="name"
          defaultValue={service?.name ?? ""}
          placeholder="Dry Cleaning"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="service_description">Description</Label>
        <Textarea
          id="service_description"
          name="description"
          defaultValue={service?.description ?? ""}
          placeholder="What this price covers"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="service_unit">Unit</Label>
          <Input
            id="service_unit"
            name="unit"
            defaultValue={service?.unit ?? "item"}
            placeholder="kg"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="service_price">Price (₹)</Label>
          <Input
            id="service_price"
            name="price"
            type="number"
            min={0}
            step="0.01"
            defaultValue={service ? String(service.price) : ""}
            placeholder="60"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="service_sortOrder">Sort order</Label>
          <Input
            id="service_sortOrder"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={service ? String(service.sort_order) : "0"}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="service_imageUrl">Image path</Label>
        <Input
          id="service_imageUrl"
          name="imageUrl"
          defaultValue={service?.image_url ?? ""}
          placeholder="/images/pricing/dry-cleaning.jpg"
        />
        <p className="text-muted-foreground text-xs">
          Optional. Kept for artwork the public site may pick up later.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id="service_isActive"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
        <Label htmlFor="service_isActive">Offer this service</Label>
      </div>

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
        <Button type="submit" disabled={isPending}>
          {isPending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Save aria-hidden="true" />
          )}
          {service ? "Save changes" : "Add service"}
        </Button>
      </DialogFooter>
    </form>
  );
}
