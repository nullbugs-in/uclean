import "server-only";

import type { DbClient, Json, Service } from "@/db/types";

import { writeAudit } from "./audit";

/**
 * Service catalogue writes, for the admin Services page.
 *
 * Takes the request-scoped client rather than the service role on purpose, the
 * same choice `store-settings.ts` makes: `services_admin_write` is what
 * authorises the write, so the database is the gate as well as the calling
 * action.
 *
 * Out of the `"use server"` action file so it is ordinary server code that takes
 * a client and can be tested against a fake.
 */

export class ServiceSettingsError extends Error {
  constructor(
    message: string,
    readonly userMessage: string,
  ) {
    super(message);
    this.name = "ServiceSettingsError";
  }
}

export type ServiceWrite = {
  name: string;
  description: string | null;
  unit: string;
  price: number;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
};

const CREATED_ACTION = "services.created";
const UPDATED_ACTION = "services.updated";
const DELETED_ACTION = "services.deleted";

/** The camelCase form, mapped onto the snake_case columns once. */
function toColumns(input: ServiceWrite) {
  return {
    name: input.name,
    description: input.description,
    unit: input.unit,
    price: input.price,
    image_url: input.imageUrl,
    is_active: input.isActive,
    sort_order: input.sortOrder,
  };
}

/** The fields the audit trail records for a service. */
function auditableService(row: Service): Json {
  return {
    name: row.name,
    description: row.description,
    unit: row.unit,
    price: row.price,
    image_url: row.image_url,
    is_active: row.is_active,
    sort_order: row.sort_order,
  };
}

/** 23505 is a unique violation, i.e. the `services_name_unique` constraint. */
function isDuplicateName(error: { message: string; code?: string }): boolean {
  return error.code === "23505" || /duplicate key/i.test(error.message);
}

/** Adds a service to the catalogue. */
export async function createService(
  client: DbClient,
  actorId: string,
  input: ServiceWrite,
): Promise<Service> {
  const { data, error } = await client
    .from("services")
    .insert(toColumns(input))
    .select("*")
    .maybeSingle();

  if (error) {
    if (isDuplicateName(error)) {
      throw new ServiceSettingsError(
        `services already has a row named ${input.name}`,
        `There is already a service called "${input.name}".`,
      );
    }

    throw new Error(error.message);
  }

  if (!data) {
    throw new ServiceSettingsError(
      "services insert returned no row",
      "We could not add the service. Please try again.",
    );
  }

  await writeAudit(client, {
    actorId,
    action: CREATED_ACTION,
    entity: "services",
    entityId: data.id,
    before: null,
    after: auditableService(data),
  });

  return data;
}

/**
 * Saves every editable field of one service.
 *
 * Reads first so the audit row carries a real `before`, and so a service deleted
 * out from under the admin is reported rather than silently rewriting nothing.
 */
export async function updateService(
  client: DbClient,
  actorId: string,
  id: string,
  input: ServiceWrite,
): Promise<Service> {
  const { data: before, error: readError } = await client
    .from("services")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!before) {
    throw new ServiceSettingsError(
      `service ${id} does not exist`,
      "That service no longer exists. Reload the page and try again.",
    );
  }

  const { data: after, error } = await client
    .from("services")
    .update(toColumns(input))
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error) {
    if (isDuplicateName(error)) {
      throw new ServiceSettingsError(
        `services already has a row named ${input.name}`,
        `There is already a service called "${input.name}".`,
      );
    }

    throw new Error(error.message);
  }

  if (!after) {
    throw new ServiceSettingsError(
      `services update returned no row for ${id}`,
      "We could not save the service. Please try again.",
    );
  }

  await writeAudit(client, {
    actorId,
    action: UPDATED_ACTION,
    entity: "services",
    entityId: after.id,
    before: auditableService(before),
    after: auditableService(after),
  });

  return after;
}

/**
 * Removes a service from the catalogue.
 *
 * `order_items.service_id` is `on delete set null`, so an order that used this
 * service keeps its line items and its recorded price and only loses the link to
 * the catalogue row. The UI offers retiring instead, because keeping that link
 * is usually what an admin wants.
 */
export async function deleteService(
  client: DbClient,
  actorId: string,
  id: string,
): Promise<void> {
  const { data: before, error: readError } = await client
    .from("services")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (readError) throw new Error(readError.message);

  if (!before) {
    throw new ServiceSettingsError(
      `service ${id} does not exist`,
      "That service no longer exists.",
    );
  }

  const { error } = await client.from("services").delete().eq("id", id);

  if (error) throw new Error(error.message);

  await writeAudit(client, {
    actorId,
    action: DELETED_ACTION,
    entity: "services",
    entityId: before.id,
    before: auditableService(before),
    after: null,
  });
}
