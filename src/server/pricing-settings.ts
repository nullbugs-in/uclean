import "server-only";

import type { DbClient, Json, PricingGroup, PricingItem, PricingOption } from "@/db/types";

import { writeAudit } from "./audit";

/**
 * Price-catalogue writes, for the admin Services & Pricing page.
 *
 * Takes the request-scoped client rather than the service role, the same
 * choice `store-settings.ts` makes: the `pricing_*` RLS is what authorises the
 * write, so the database is the gate as well as the calling action.
 *
 * Out of the `"use server"` action file so it is ordinary server code that
 * takes a client and can be tested against a fake.
 *
 * Three things are fixed by hand here because the database deliberately does
 * not do them:
 *
 * - Slugs are derived from the name **at insert** and never on rename.
 *   Renaming a group or service keeps its slug, so nothing that already read
 *   it (a customer mid-booking, a link from last week) breaks.
 * - Uniqueness is scoped per parent: item slugs may repeat across groups but
 *   not within one. A 23505 is reported to the admin as a name clash.
 * - Retiring an item/archiving a group hides it from the public list while
 *   keeping it re-usable, which is offered instead of delete for exactly the
 *   reason the old catalogue retired: the pricing history of past bookings
 *   lives in their own rows, but the admin almost always wants the row back.
 */

export class PricingSettingsError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "PricingSettingsError";
  }
}

/** "Adult Wear" -> "adult-wear", stable enough to mean the same thing tomorrow. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** 23505 is a unique violation, i.e. a slug clash. */
function isDuplicate(error: { message: string; code?: string }): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message);
}

type GroupWrite = {
  name: string;
  turnaround: string | null;
  sortOrder: number;
  isActive: boolean;
};

type ItemWrite = {
  name: string;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
};

type OptionWrite = {
  label: string | null;
  originalPrice: number;
  price: number;
  unit: string;
  turnaround: string | null;
  sortOrder: number;
};

const ENTITIES = {
  group: "pricing_groups",
  item: "pricing_items",
  option: "pricing_options",
} as const;

// --- groups -----------------------------------------------------------------

function toGroupColumns(input: GroupWrite) {
  return {
    name: input.name,
    turnaround: input.turnaround,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };
}

/** The auditable slice of a group row. */
function auditableGroup(row: PricingGroup): Json {
  return {
    slug: row.slug,
    name: row.name,
    turnaround: row.turnaround,
    sort_order: row.sort_order,
    is_active: row.is_active,
  };
}

/** Adds a subcategory to the list. */
export async function createGroup(
  client: DbClient,
  actorId: string,
  input: GroupWrite,
): Promise<PricingGroup> {
  const { data, error } = await client
    .from("pricing_groups")
    .insert({ ...toGroupColumns(input), slug: slugify(input.name) })
    .select("*")
    .maybeSingle();

  if (error) return throwWrite(error, groupClash(input.name), "create the group");
  if (!data) return throwMissing("create the group");

  await writeAudit(client, {
    actorId,
    action: "pricing.group_created",
    entity: ENTITIES.group,
    entityId: data.id,
    before: null,
    after: auditableGroup(data),
  });

  return data;
}

/**
 * Saves a subcategory. A new name does *not* produce a new slug: the slug was
 * minted once at creation and stays.
 */
export async function updateGroup(
  client: DbClient,
  actorId: string,
  id: string,
  input: GroupWrite,
): Promise<PricingGroup> {
  const before = await readRow<PricingGroup>(client, ENTITIES.group, id);
  if (!before) {
    throw new PricingSettingsError(
      `pricing group ${id} does not exist`,
      "That category no longer exists. Reload the page and try again.",
    );
  }

  const { data, error } = await client
    .from("pricing_groups")
    .update(toGroupColumns(input))
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return throwWrite(error, groupClash(input.name), "save the group");
  if (!data) return throwMissing("save the group");

  await writeAudit(client, {
    actorId,
    action: "pricing.group_updated",
    entity: ENTITIES.group,
    entityId: data.id,
    before: auditableGroup(before),
    after: auditableGroup(data),
  });

  return data;
}

/** Removes a subcategory and everything under it (the cascade the schema owns). */
export async function deleteGroup(
  client: DbClient,
  actorId: string,
  id: string,
): Promise<void> {
  const before = await readRow<PricingGroup>(client, ENTITIES.group, id);
  if (!before) {
    throw new PricingSettingsError(
      `pricing group ${id} does not exist`,
      "That category no longer exists.",
    );
  }

  const { error } = await client
    .from("pricing_groups")
    .delete()
    .eq("id", id);

  if (error) throw new Error(error.message);

  await writeAudit(client, {
    actorId,
    action: "pricing.group_deleted",
    entity: ENTITIES.group,
    entityId: before.id,
    before: auditableGroup(before),
    after: null,
  });
}

function groupClash(name: string) {
  return new PricingSettingsError(
    `pricing_groups already has a slug for ${name}`,
    `There is already a category called "${name}".`,
  );
}

// --- items ------------------------------------------------------------------

function toItemColumns(input: ItemWrite) {
  return {
    name: input.name,
    image_url: input.imageUrl,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  };
}

function auditableItem(row: PricingItem): Json {
  return {
    group_id: row.group_id,
    slug: row.slug,
    name: row.name,
    image_url: row.image_url,
    sort_order: row.sort_order,
    is_active: row.is_active,
  };
}

function itemClash(name: string) {
  return new PricingSettingsError(
    "pricing_items already has that slug in the group",
    `There is already a service called "${name}" in that category.`,
  );
}

function itemNotFound(id: string) {
  return new PricingSettingsError(
    `pricing item ${id} does not exist`,
    "That service no longer exists. Reload the page and try again.",
  );
}

/** Adds a service (with no prices yet) into a subcategory. */
export async function createItem(
  client: DbClient,
  actorId: string,
  groupId: string,
  input: ItemWrite,
): Promise<PricingItem> {
  const { data, error } = await client
    .from("pricing_items")
    .insert({
      group_id: groupId,
      ...toItemColumns(input),
      slug: slugify(input.name),
    })
    .select("*")
    .maybeSingle();

  if (error) return throwWrite(error, itemClash(input.name), "add the service");
  if (!data) return throwMissing("add the service");

  await writeAudit(client, {
    actorId,
    action: "pricing.item_created",
    entity: ENTITIES.item,
    entityId: data.id,
    before: null,
    after: auditableItem(data),
  });

  return data;
}

/** Saves every editable field of one service. */
export async function updateItem(
  client: DbClient,
  actorId: string,
  id: string,
  input: ItemWrite,
): Promise<PricingItem> {
  const before = await readRow<PricingItem>(client, ENTITIES.item, id);
  if (!before) throw itemNotFound(id);

  const { data, error } = await client
    .from("pricing_items")
    .update(toItemColumns(input))
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) return throwWrite(error, itemClash(input.name), "save the service");
  if (!data) return throwMissing("save the service");

  await writeAudit(client, {
    actorId,
    action: "pricing.item_updated",
    entity: ENTITIES.item,
    entityId: data.id,
    before: auditableItem(before),
    after: auditableItem(data),
  });

  return data;
}

/** Removes a service and its price lines (the cascade the schema owns). */
export async function deleteItem(
  client: DbClient,
  actorId: string,
  id: string,
): Promise<void> {
  const before = await readRow<PricingItem>(client, ENTITIES.item, id);
  if (!before) throw itemNotFound(id);

  const { error } = await client.from("pricing_items").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit(client, {
    actorId,
    action: "pricing.item_deleted",
    entity: ENTITIES.item,
    entityId: id,
    before: auditableItem(before),
    after: null,
  });
}

// --- options ----------------------------------------------------------------

function toOptionColumns(input: OptionWrite) {
  return {
    label: input.label,
    original_price: input.originalPrice,
    price: input.price,
    unit: input.unit,
    turnaround: input.turnaround,
    sort_order: input.sortOrder,
  };
}

function auditableOption(row: PricingOption): Json {
  return {
    item_id: row.item_id,
    label: row.label,
    original_price: row.original_price,
    price: row.price,
    unit: row.unit,
    turnaround: row.turnaround,
    sort_order: row.sort_order,
  };
}

/** Throws when the option row vanished between read and write. */
function optionNotFound(id: string) {
  return new PricingSettingsError(
    `pricing option ${id} does not exist`,
    "That price no longer exists. Reload the page and try again.",
  );
}

/** Adds a priced line to a service. */
export async function createOption(
  client: DbClient,
  actorId: string,
  itemId: string,
  input: OptionWrite,
): Promise<PricingOption> {
  const { data, error } = await client
    .from("pricing_options")
    .insert({ item_id: itemId, ...toOptionColumns(input) })
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return throwMissing("add the price");

  await writeAudit(client, {
    actorId,
    action: "pricing.option_created",
    entity: ENTITIES.option,
    entityId: data.id,
    before: null,
    after: auditableOption(data),
  });

  return data;
}

/** One price on one line: the common edit on the page. */
export async function updateOption(
  client: DbClient,
  actorId: string,
  id: string,
  input: OptionWrite,
): Promise<PricingOption> {
  const before = await readRow<PricingOption>(client, ENTITIES.option, id);
  if (!before) throw optionNotFound(id);

  const { data, error } = await client
    .from("pricing_options")
    .update(toOptionColumns(input))
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return throwMissing("save the price");

  await writeAudit(client, {
    actorId,
    action: "pricing.option_updated",
    entity: ENTITIES.option,
    entityId: data.id,
    before: auditableOption(before),
    after: auditableOption(data),
  });

  return data;
}

/** Removes a priced line, badge and all. */
export async function deleteOption(
  client: DbClient,
  actorId: string,
  id: string,
): Promise<void> {
  const before = await readRow<PricingOption>(client, ENTITIES.option, id);
  if (!before) throw optionNotFound(id);

  const { error } = await client.from("pricing_options").delete().eq("id", id);
  if (error) throw new Error(error.message);

  await writeAudit(client, {
    actorId,
    action: "pricing.option_deleted",
    entity: ENTITIES.option,
    entityId: id,
    before: auditableOption(before),
    after: null,
  });
}

// --- shared plumbing --------------------------------------------------------

/** Reads one row so an update can carry a real `before` in its audit row. */
async function readRow<T extends { id: string }>(
  client: DbClient,
  entity: string,
  id: string,
): Promise<T | null> {
  const { data, error } = await client
    .from(entity)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as T | null) ?? null;
}

function throwMissing(verb: string): never {
  throw new Error(`The database did not return a row after we ${verb}`);
}

/**
 * The single place a duplicate-slug write turns into an admin-readable line.
 * Everything else is a backend error the dialog shows as a fallback.
 */
function throwWrite(
  error: { message: string; code?: string },
  clash: PricingSettingsError,
  verb: string,
): never {
  if (isDuplicate(error)) throw clash;

  console.error(`Could not ${verb} (database)`, error);
  throw new Error(error.message);
}
