"use client";

import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import * as React from "react";

import { SpeedToggle } from "@/components/pricing/speed-toggle";
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
import { Input, Label } from "@/components/ui/input";
import { EXPRESS_MULTIPLIER } from "@/lib/pricing";
import { formatPrice } from "@/lib/utils";
import type { PricingGroup, PricingItem, PricingOption } from "@/db/types";

import {
  createGroupAction,
  createItemAction,
  createOptionAction,
  deleteGroupAction,
  deleteItemAction,
  deleteOptionAction,
  updateGroupAction,
  updateItemAction,
  updateOptionAction,
} from "./actions";

/**
 * The editor for the price list every customer surface quotes from.
 *
 * Modelled on the product the customer sees — the Regular/Express toggle on
 * top, one category capsule row — so the person editing is looking at the pages
 * the customer reads. Reading is by display order, which the database decides,
 * and editing is grouped the way the rows are: categories (with rename, retire
 * and delete), services, and price lines.
 *
 * Everything visible is live data from `pricing_groups` / `pricing_items` /
 * `pricing_options`. There is no fallback list and no sample rows to seed the
 * view with: an empty database renders an empty editor, which is the truth.
 */

type GroupFormState =
  | { mode: "add" }
  | { mode: "edit"; group: PricingGroup }
  | null;

type ItemFormState =
  | { mode: "add"; groupId: string }
  | { mode: "edit"; item: PricingItem }
  | null;

type OptionFormState =
  | { mode: "add"; itemId: string }
  | { mode: "edit"; option: PricingOption }
  | null;

type ConfirmDelete =
  | { kind: "group"; id: string; name: string }
  | { kind: "item"; id: string; name: string }
  | { kind: "option"; id: string; name: string }
  | null;

/** The camelCase writes the form dialogs hand to the actions. */
type GroupDraft = {
  name: string;
  turnaround: string | null;
  sortOrder: number;
  isActive: boolean;
};

type ItemDraft = {
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

type OptionDraft = {
  label: string | null;
  originalPrice: number;
  price: number;
  unit: string;
  turnaround: string | null;
  sortOrder: number;
};

function byOrder(a: { sort_order: number; name: string }, b: { sort_order: number; name: string }) {
  return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
}

function toNumber(text: string, fallback = 0): number {
  const value = Number(text);
  return Number.isFinite(value) ? value : fallback;
}

function toNullText(text: string): string | null {
  const value = text.trim();
  return value === "" ? null : value;
}

export function PricingPanel({
  groups,
  items,
  options,
}: {
  groups: PricingGroup[];
  items: PricingItem[];
  options: PricingOption[];
}) {
  const [speed, setSpeed] = React.useState<"regular" | "express">("regular");
  const [activeGroupId, setActiveGroupId] = React.useState<string | null>(
    () => groups[0]?.id ?? null,
  );
  const [groupForm, setGroupForm] = React.useState<GroupFormState>(null);
  const [itemForm, setItemForm] = React.useState<ItemFormState>(null);
  const [optionForm, setOptionForm] = React.useState<OptionFormState>(null);
  const [confirming, setConfirming] = React.useState<ConfirmDelete>(null);

  const [notice, setNotice] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const orderedGroups = React.useMemo(
    () => [...groups].sort(byOrder),
    [groups],
  );

  const activeGroup =
    orderedGroups.find((group) => group.id === activeGroupId) ??
    orderedGroups[0] ??
    null;

  // No sync effect: when the open selection vanishes (a deleted category), the
  // derived fallback above renders the first group instead; the stale id is
  // still the selector, so a click on a capsule simply re-points it.

  const optionsByItem = React.useMemo(() => {
    const map = new Map<string, PricingOption[]>();
    for (const option of options) {
      const bucket = map.get(option.item_id) ?? [];
      bucket.push(option);
      map.set(option.item_id, bucket);
    }
    return map;
  }, [options]);

  const itemsInGroup = React.useMemo(
    () =>
      items
        .filter((entry) => entry.group_id === activeGroup?.id)
        .sort(byOrder),
    [items, activeGroup],
  );

  function resetFeedback() {
    setNotice(null);
    setError(null);
  }

  function runAction(work: () => Promise<{ ok: boolean; message: string }>) {
    resetFeedback();
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(result.message);
      setGroupForm(null);
      setItemForm(null);
      setOptionForm(null);
      setConfirming(null);
    });
  }

  // Express is derived at read time; while its view is up the editor locks, so
  // an admin cannot come to believe they are editing a second stored list.
  const editingLocked = speed === "express";

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-3">
        <SpeedToggle
          category={speed}
          onChange={(next) => {
            resetFeedback();
            setSpeed(next);
          }}
        />
        {editingLocked ? (
          <p className="text-muted-foreground bg-muted rounded-md px-3 py-1.5 text-center text-xs">
            Express figures are this Regular list × {EXPRESS_MULTIPLIER},
            computed when the pages read it, so there is nothing to edit here.
          </p>
        ) : null}
      </div>

      {notice ? (
        <p className="text-muted-foreground text-sm" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}

      <GroupRow
        groups={orderedGroups}
        activeId={activeGroup?.id ?? null}
        locked={editingLocked}
        onSelect={setActiveGroupId}
        onAdd={() => setGroupForm({ mode: "add" })}
        onEdit={(group) => setGroupForm({ mode: "edit", group })}
        onDelete={(group) =>
          setConfirming({ kind: "group", id: group.id, name: group.name })
        }
      />

      {orderedGroups.length === 0 && !editingLocked ? (
        <p className="text-muted-foreground text-sm">
          No categories yet. Add the first one to start building the price list.
        </p>
      ) : null}

      {activeGroup ? (
        <div className="space-y-4">
          {!editingLocked ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-muted-foreground self-center text-xs">
                {itemsInGroup.length}{" "}
                {itemsInGroup.length === 1 ? "service" : "services"} in{" "}
                {activeGroup.name}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setItemForm({ mode: "add", groupId: activeGroup.id })
                }
              >
                <Plus aria-hidden /> Add service
              </Button>
            </div>
          ) : null}

          {itemsInGroup.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {activeGroup.name} has no services on the list yet.
            </p>
          ) : null}

          {itemsInGroup.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              group={activeGroup}
              options={optionsByItem.get(item.id) ?? []}
              locked={editingLocked}
              onEdit={() => setItemForm({ mode: "edit", item })}
              onDelete={() =>
                setConfirming({ kind: "item", id: item.id, name: item.name })
              }
              onAddOption={() => setOptionForm({ mode: "add", itemId: item.id })}
              onEditOption={(option) => setOptionForm({ mode: "edit", option })}
              onDeleteOption={(option) =>
                setConfirming({
                  kind: "option",
                  id: option.id,
                  name: option.label ?? item.name,
                })
              }
            />
          ))}
        </div>
      ) : null}

      {groupForm ? (
        <GroupForm
          key={groupForm.mode === "edit" ? groupForm.group.id : "add-group"}
          state={groupForm}
          pending={isPending}
          nextSortOrder={
            Math.max(0, ...orderedGroups.map((g) => g.sort_order)) + 1
          }
          onDismiss={() => setGroupForm(null)}
          onSubmit={(input) =>
            runAction(() =>
              groupForm.mode === "edit"
                ? updateGroupAction(groupForm.group.id, input)
                : createGroupAction(input),
            )
          }
        />
      ) : null}

      {itemForm ? (
        <ItemForm
          key={itemForm.mode === "edit" ? itemForm.item.id : "add-item"}
          state={itemForm}
          pending={isPending}
          nextSortOrder={
            Math.max(
              0,
              ...items
                .filter((entry) => entry.group_id === activeGroup?.id)
                .map((entry) => entry.sort_order),
            ) + 1
          }
          onDismiss={() => setItemForm(null)}
          onSubmit={(input) =>
            runAction(() =>
              itemForm.mode === "edit"
                ? updateItemAction(
                    { id: itemForm.item.id, groupId: itemForm.item.group_id },
                    input,
                  )
                : createItemAction(itemForm.groupId, input),
            )
          }
        />
      ) : null}

      {optionForm ? (
        <OptionForm
          key={optionForm.mode === "edit" ? optionForm.option.id : "add-option"}
          state={optionForm}
          pending={isPending}
          nextSortOrder={Math.max(0, ...options.map((o) => o.sort_order)) + 1}
          onDismiss={() => setOptionForm(null)}
          onSubmit={(input) =>
            runAction(() =>
              optionForm.mode === "edit"
                ? updateOptionAction(optionForm.option.id, input)
                : createOptionAction(optionForm.itemId, input),
            )
          }
        />
      ) : null}

      {confirming ? (
        <DeleteConfirm
          confirming={confirming}
          pending={isPending}
          onDismiss={() => setConfirming(null)}
          onConfirm={() => {
            if (!confirming) return;
            const { kind, id, name } = confirming;
            runAction(() =>
              kind === "group"
                ? deleteGroupAction(id, name)
                : kind === "item"
                  ? deleteItemAction(id, name)
                  : deleteOptionAction(id),
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** The capsule row, one per category, with the editor's verbs beside it. */
function GroupRow({
  groups,
  activeId,
  locked,
  onSelect,
  onAdd,
  onEdit,
  onDelete,
}: {
  groups: PricingGroup[];
  activeId: string | null;
  locked: boolean;
  onSelect: (id: string | null) => void;
  onAdd: () => void;
  onEdit: (group: PricingGroup) => void;
  onDelete: (group: PricingGroup) => void;
}) {
  const active = groups.find((group) => group.id === activeId) ?? null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {groups.map((group) => {
          const selected = group.id === activeId;

          return (
            <button
              key={group.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(group.id)}
              className={
                "ring-border rounded-full px-4 py-1.5 text-sm font-semibold ring-1 ring-inset transition-colors focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none " +
                (selected
                  ? "bg-primary text-primary-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground")
              }
            >
              {group.name}
              {!group.is_active ? (
                <span className="ml-2 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  Hidden
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {active && !locked ? (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onEdit(active)}>
            <Pencil aria-hidden /> Edit category
          </Button>
          <Button variant="ghost" size="sm" onClick={onAdd}>
            <Plus aria-hidden /> Add category
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive"
            onClick={() => onDelete(active)}
          >
            <Trash2 aria-hidden /> Delete category
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** One service with its price lines: the rows every price edit happens on. */
function ItemCard({
  item,
  group,
  options,
  locked,
  onEdit,
  onDelete,
  onAddOption,
  onEditOption,
  onDeleteOption,
}: {
  item: PricingItem;
  group: PricingGroup;
  options: PricingOption[];
  locked: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onAddOption: () => void;
  onEditOption: (option: PricingOption) => void;
  onDeleteOption: (option: PricingOption) => void;
}) {
  const multiplier = locked ? EXPRESS_MULTIPLIER : 1;

  return (
    <div className="ring-border bg-background rounded-xl ring-1 ring-inset">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold">{item.name}</span>
          {!item.is_active ? <Badge variant="outline">Hidden</Badge> : null}
          {group.turnaround ? (
            <span className="text-muted-foreground text-xs">
              Ready in {group.turnaround}
            </span>
          ) : null}
        </div>

        {!locked ? (
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={onEdit}>
              <Pencil aria-hidden /> Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive"
              onClick={onDelete}
            >
              <Trash2 aria-hidden /> Delete
            </Button>
          </div>
        ) : null}
      </div>

      <div className="divide-y divide-[var(--border)]">
        {options.length === 0 ? (
          <p className="text-muted-foreground px-4 py-3 text-xs">
            No prices on this service yet — the customer list hides it until one
            is added.
          </p>
        ) : null}

        {options.map((option) => (
          <div
            key={option.id}
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
          >
            <div className="min-w-0">
              {option.label ? (
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
              ) : (
                <span className="text-muted-foreground block text-xs">
                  Base price
                </span>
              )}
              <span className="text-muted-foreground block text-xs">
                {option.turnaround ? `${option.turnaround} · ` : ""}
                {option.unit}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-right whitespace-nowrap">
                {option.original_price > option.price ? (
                  <span className="text-muted-foreground mr-2 text-sm line-through">
                    {formatPrice(option.original_price * multiplier)}
                  </span>
                ) : null}
                <span className="font-display text-base font-bold">
                  {formatPrice(option.price * multiplier)}
                </span>
                <span className="text-muted-foreground text-xs">
                  {" / "}
                  {option.unit}
                </span>
              </span>

              {!locked ? (
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onEditOption(option)}
                  >
                    <Pencil aria-hidden /> Price
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={() => onDeleteOption(option)}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        ))}

        {!locked ? (
          <div className="px-4 py-2">
            <Button variant="ghost" size="sm" onClick={onAddOption}>
              <Plus aria-hidden /> Add price line
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// -- dialogs -----------------------------------------------------------------

function DialogShell({
  title,
  description,
  pending,
  submitLabel,
  onDismiss,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  pending: boolean;
  submitLabel: string;
  onDismiss: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {children}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDismiss}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden />
              ) : null}
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-muted-foreground text-xs">{hint}</p> : null}
    </div>
  );
}

function GroupForm({
  state,
  pending,
  nextSortOrder,
  onDismiss,
  onSubmit,
}: {
  state: NonNullable<GroupFormState>;
  pending: boolean;
  nextSortOrder: number;
  onDismiss: () => void;
  onSubmit: (values: GroupDraft) => void;
}) {
  const source = state.mode === "edit" ? state.group : null;
  const [name, setName] = React.useState(source?.name ?? "");
  const [turnaround, setTurnaround] = React.useState(
    source?.turnaround ?? "",
  );
  const [sortOrder, setSortOrder] = React.useState(
    String(source?.sort_order ?? nextSortOrder),
  );
  const [isActive, setIsActive] = React.useState(source?.is_active ?? true);

  return (
    <DialogShell
      title={source ? `Edit ${source.name}` : "Add a category"}
      description="The capped subcategory customer pages show. A name becomes the category's slug once, at creation, so renames never break stored keys."
      pending={pending}
      submitLabel={source ? "Save category" : "Add category"}
      onDismiss={onDismiss}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: name.trim(),
          turnaround: toNullText(turnaround),
          sortOrder: toNumber(sortOrder),
          isActive,
        });
      }}
    >
      <Field label="Name" htmlFor="group-name">
        <Input
          id="group-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </Field>
      <Field
        label="Turnaround"
        hint="The note under the category name, e.g. “2 days”. Leave blank for none."
        htmlFor="group-turnaround"
      >
        <Input
          id="group-turnaround"
          value={turnaround}
          onChange={(event) => setTurnaround(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sort order" htmlFor="group-sort">
          <Input
            id="group-sort"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </Field>
        <div className="flex items-end gap-2 pb-2">
          <input
            id="group-active"
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          <label htmlFor="group-active" className="text-sm">
            Visible to customers
          </label>
        </div>
      </div>
    </DialogShell>
  );
}

function ItemForm({
  state,
  pending,
  nextSortOrder,
  onDismiss,
  onSubmit,
}: {
  state: NonNullable<ItemFormState>;
  pending: boolean;
  nextSortOrder: number;
  onDismiss: () => void;
  onSubmit: (values: ItemDraft) => void;
}) {
  const source = state.mode === "edit" ? state.item : null;
  const [name, setName] = React.useState(source?.name ?? "");
  const [imageUrl, setImageUrl] = React.useState(source?.image_url ?? "");
  const [sortOrder, setSortOrder] = React.useState(
    String(source?.sort_order ?? nextSortOrder),
  );
  const [isActive, setIsActive] = React.useState(source?.is_active ?? true);

  return (
    <DialogShell
      title={source ? `Edit ${source.name}` : "Add a service"}
      description="One service on the list. It stays unpublished until a price line is added to it."
      pending={pending}
      submitLabel={source ? "Save service" : "Add service"}
      onDismiss={onDismiss}
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit({
          name: name.trim(),
          imageUrl: toNullText(imageUrl),
          sortOrder: toNumber(sortOrder),
          isActive,
        });
      }}
    >
      <Field label="Name" htmlFor="item-name">
        <Input
          id="item-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoFocus
        />
      </Field>
      <Field
        label="Image path"
        hint="Optional. A /public path, e.g. /services/shirt.jpg."
        htmlFor="item-image"
      >
        <Input
          id="item-image"
          value={imageUrl}
          onChange={(event) => setImageUrl(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Sort order" htmlFor="item-sort">
          <Input
            id="item-sort"
            type="number"
            min={0}
            value={sortOrder}
            onChange={(event) => setSortOrder(event.target.value)}
          />
        </Field>
        <div className="flex items-end gap-2 pb-2">
          <input
            id="item-active"
            type="checkbox"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
          <label htmlFor="item-active" className="text-sm">
            Visible to customers
          </label>
        </div>
      </div>
    </DialogShell>
  );
}

function OptionForm({
  state,
  pending,
  nextSortOrder,
  onDismiss,
  onSubmit,
}: {
  state: NonNullable<OptionFormState>;
  pending: boolean;
  nextSortOrder: number;
  onDismiss: () => void;
  onSubmit: (values: OptionDraft) => void;
}) {
  const source = state.mode === "edit" ? state.option : null;
  const [label, setLabel] = React.useState(source?.label ?? "");
  const [originalPrice, setOriginalPrice] = React.useState(
    String(source?.original_price ?? ""),
  );
  const [price, setPrice] = React.useState(String(source?.price ?? ""));
  const [unit, setUnit] = React.useState(source?.unit ?? "piece");
  const [turnaround, setTurnaround] = React.useState(
    source?.turnaround ?? "",
  );
  const [formError, setFormError] = React.useState<string | null>(null);

  return (
    <DialogShell
      title={source ? "Edit the price" : "Add a price line"}
      description="The money a booking is actually quoted. The line at hand is what the booking wizard books against."
      pending={pending}
      submitLabel={source ? "Save price" : "Add price"}
      onDismiss={onDismiss}
      onSubmit={(event) => {
        event.preventDefault();
        setFormError(null);

        const display = toNumber(price, Number.NaN);
        const original = toNumber(originalPrice, display);
        if (!Number.isFinite(display)) {
          setFormError("Enter the price to display.");
          return;
        }
        if (display < 0 || original < 0) {
          setFormError("Amounts cannot be negative.");
          return;
        }
        if (original < display) {
          setFormError(
            "The original price should match or exceed the displayed price.",
          );
          return;
        }

        onSubmit({
          label: toNullText(label),
          originalPrice: original,
          price: display,
          unit: unit.trim() || "piece",
          turnaround: toNullText(turnaround),
          sortOrder: source?.sort_order ?? nextSortOrder,
        });
      }}
    >
      <Field
        label="Label"
        hint="Optional — “Dry Cleaning” vs “Steam Ironing”. Blank means the single base price."
        htmlFor="option-label"
      >
        <Input
          id="option-label"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Original (struck through)" htmlFor="option-original">
          <Input
            id="option-original"
            type="number"
            min={0}
            step="0.5"
            value={originalPrice}
            onChange={(event) => setOriginalPrice(event.target.value)}
          />
        </Field>
        <Field label="Price shown" htmlFor="option-price">
          <Input
            id="option-price"
            type="number"
            min={0}
            step="0.5"
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            autoFocus={Boolean(source)}
          />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit" htmlFor="option-unit">
          <Input
            id="option-unit"
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          />
        </Field>
        <Field
          label="Turnaround"
          hint="Optional per-line note, e.g. “3 days”."
          htmlFor="option-turnaround"
        >
          <Input
            id="option-turnaround"
            value={turnaround}
            onChange={(event) => setTurnaround(event.target.value)}
          />
        </Field>
      </div>
      {formError ? <p className="text-destructive text-sm">{formError}</p> : null}
    </DialogShell>
  );
}

function DeleteConfirm({
  confirming,
  pending,
  onDismiss,
  onConfirm,
}: {
  confirming: NonNullable<ConfirmDelete>;
  pending: boolean;
  onDismiss: () => void;
  onConfirm: () => void;
}) {
  const message =
    confirming.kind === "group"
      ? `“${confirming.name}” and every service and price under it will be removed. Past bookings keep what they recorded — nothing changes there — but there is no undo.`
      : confirming.kind === "item"
        ? `“${confirming.name}” and its price lines will be removed from every customer list, immediately.`
        : "This price line will be removed; the service stays.";

  return (
    <Dialog open onOpenChange={(open) => !open && onDismiss()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {confirming.name}?</DialogTitle>
          <DialogDescription>{message}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDismiss}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden /> : null}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
