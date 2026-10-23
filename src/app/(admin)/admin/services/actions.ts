"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { createClient } from "@/db/server";
import {
  pricingGroupCreateSchema,
  pricingGroupSchema,
  pricingItemCreateSchema,
  pricingItemSchema,
  pricingOptionCreateSchema,
  pricingOptionUpdateSchema,
} from "@/lib/validation";
import { requireAdmin } from "@/server/auth";
import { DomainError } from "@/server/errors";
import {
  PricingSettingsError,
  createGroup,
  createItem,
  createOption,
  deleteGroup,
  deleteItem,
  deleteOption,
  updateGroup,
  updateItem,
  updateOption,
} from "@/server/pricing-settings";

/**
 * Admin Services & Pricing actions.
 *
 * Each opens with `requireAdmin()`, and the write is *also* gated by the
 * `pricing_*` RLS policies. That is deliberate duplication: these are public
 * endpoints, and the policy is what makes a forgotten check a non-event rather
 * than a vulnerability.
 *
 * This is the single source of truth for what every customer surface quotes —
 * /pricing, the /book wizard, the walk-in counter, the invoice lookup and the
 * home overview — so every save revalidates all of them. The read layer pulls
 * straight from the database, and these paths are where it is recomputed.
 */

/** The paths a catalogue edit must refresh before the response returns. */
function revalidatePricing() {
  revalidatePath("/admin/services");
  revalidatePath("/pricing");
  revalidatePath("/pricing/[category]", "page");
  revalidatePath("/book");
  revalidatePath("/admin/walk-in");
  revalidatePath("/");
}

export type PricingActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

/** Maps a thrown error to the one line the dialog should show. */
function describeFailure(error: unknown, fallback: string, log: string): string {
  if (error instanceof PricingSettingsError) return error.userMessage;
  if (error instanceof DomainError) return error.userMessage;

  console.error(log, error);
  return fallback;
}

/**
 * The shape every action runs to: validate, prove the admin, write through the
 * RLS-gated client, revalidate, and convert everything thrown into one line.
 * The database is still the authority on whether the write lands.
 */
async function guarded<S extends z.ZodTypeAny>(
  schema: S,
  input: unknown,
  write: (
    parsed: z.infer<S>,
    supabase: Awaited<ReturnType<typeof createClient>>,
    actorId: string,
  ) => Promise<string>,
  fallback: string,
  log: string,
): Promise<PricingActionResult> {
  const parsed = schema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? fallback,
    };
  }

  try {
    const admin = await requireAdmin();
    const supabase = await createClient();
    const message = await write(parsed.data, supabase, admin.profile.id);

    revalidatePricing();
    return { ok: true, message };
  } catch (error) {
    return { ok: false, message: describeFailure(error, fallback, log) };
  }
}

// -- groups ------------------------------------------------------------------

type GroupInput = {
  name: string;
  turnaround: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function createGroupAction(
  input: GroupInput,
): Promise<PricingActionResult> {
  return guarded(
    pricingGroupCreateSchema,
    input,
    async (parsed, supabase, actorId) => {
      const saved = await createGroup(supabase, actorId, parsed);
      return `Added the ${saved.name} category.`;
    },
    "We could not add the category. Please try again.",
    "Could not create the pricing group",
  );
}

export async function updateGroupAction(
  id: string,
  input: GroupInput,
): Promise<PricingActionResult> {
  return guarded(
    pricingGroupSchema,
    { ...input, id },
    async (parsed, supabase, actorId) => {
      await updateGroup(supabase, actorId, parsed.id, parsed);
      return `Saved the ${parsed.name} category.`;
    },
    "We could not save the category. Please try again.",
    "Could not update the pricing group",
  );
}

export async function deleteGroupAction(
  id: string,
  name: string,
): Promise<PricingActionResult> {
  return guarded(
    z.object({ id: z.string().uuid() }),
    { id },
    async (parsed, supabase, actorId) => {
      await deleteGroup(supabase, actorId, parsed.id);
      return `Deleted the ${name} category and everything priced under it.`;
    },
    "We could not delete the category. Please try again.",
    "Could not delete the pricing group",
  );
}

// -- items -------------------------------------------------------------------

type ItemInput = {
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

export async function createItemAction(
  groupId: string,
  input: ItemInput,
): Promise<PricingActionResult> {
  return guarded(
    pricingItemCreateSchema,
    { ...input, groupId },
    async (parsed, supabase, actorId) => {
      const saved = await createItem(supabase, actorId, parsed.groupId, {
        name: parsed.name,
        imageUrl: parsed.imageUrl,
        sortOrder: parsed.sortOrder,
        isActive: parsed.isActive,
      });
      return `Added ${saved.name}.`;
    },
    "We could not add the service. Please try again.",
    "Could not create the pricing item",
  );
}

export async function updateItemAction(
  item: { id: string; groupId: string },
  input: ItemInput,
): Promise<PricingActionResult> {
  return guarded(
    pricingItemSchema,
    { ...input, groupId: item.groupId, id: item.id },
    async (parsed, supabase, actorId) => {
      await updateItem(supabase, actorId, parsed.id, {
        name: parsed.name,
        imageUrl: parsed.imageUrl,
        sortOrder: parsed.sortOrder,
        isActive: parsed.isActive,
      });
      return `Saved ${parsed.name}.`;
    },
    "We could not save the service. Please try again.",
    "Could not update the pricing item",
  );
}

export async function deleteItemAction(
  id: string,
  name: string,
): Promise<PricingActionResult> {
  return guarded(
    z.object({ id: z.string().uuid() }),
    { id },
    async (parsed, supabase, actorId) => {
      await deleteItem(supabase, actorId, parsed.id);
      return `Deleted ${name} and its price lines.`;
    },
    "We could not delete the service. Please try again.",
    "Could not delete the pricing item",
  );
}

// -- options -----------------------------------------------------------------

type OptionInput = {
  label: string | null;
  originalPrice: number;
  price: number;
  unit: string;
  turnaround: string | null;
  sortOrder: number;
};

export async function createOptionAction(
  itemId: string,
  input: OptionInput,
): Promise<PricingActionResult> {
  return guarded(
    pricingOptionCreateSchema,
    { ...input, itemId },
    async (parsed, supabase, actorId) => {
      await createOption(supabase, actorId, parsed.itemId, {
        label: parsed.label,
        originalPrice: parsed.originalPrice,
        price: parsed.price,
        unit: parsed.unit,
        turnaround: parsed.turnaround,
        sortOrder: parsed.sortOrder,
      });
      return "Added the price line.";
    },
    "We could not add the price. Please try again.",
    "Could not create the pricing option",
  );
}

export async function updateOptionAction(
  id: string,
  input: OptionInput,
): Promise<PricingActionResult> {
  return guarded(
    pricingOptionUpdateSchema,
    { ...input, id },
    async (parsed, supabase, actorId) => {
      await updateOption(supabase, actorId, parsed.id, {
        label: parsed.label,
        originalPrice: parsed.originalPrice,
        price: parsed.price,
        unit: parsed.unit,
        turnaround: parsed.turnaround,
        sortOrder: parsed.sortOrder,
      });
      return "Saved the price.";
    },
    "We could not save the price. Please try again.",
    "Could not update the pricing option",
  );
}

export async function deleteOptionAction(
  id: string,
): Promise<PricingActionResult> {
  return guarded(
    z.object({ id: z.string().uuid() }),
    { id },
    async (parsed, supabase, actorId) => {
      await deleteOption(supabase, actorId, parsed.id);
      return "Deleted the price line.";
    },
    "We could not delete the price. Please try again.",
    "Could not delete the pricing option",
  );
}
