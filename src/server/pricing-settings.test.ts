import { describe, expect, it } from "vitest";

import type { DbClient, Json, PricingGroup, PricingItem, PricingOption } from "@/db/types";

import {
  PricingSettingsError,
  createGroup,
  createItem,
  createOption,
  deleteGroup,
  deleteItem,
  deleteOption,
  slugify,
  updateGroup,
  updateItem,
  updateOption,
} from "./pricing-settings";

/**
 * `pricing_groups`, `pricing_items`, `pricing_options` and `audit_logs`, faked.
 *
 * Not a mock of the query builder: three small tables with the behaviours that
 * matter here. Group slugs are unique across the catalogue, item slugs unique
 * within their group, updates replace rather than mutate (so a `before`
 * snapshot stays valid, as it does against the real client), and every write
 * lands in `audit_logs`.
 */

type AuditRow = {
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
};

const GROUP_ID = "11111111-1111-1111-1111-111111111111";
const ITEM_ID = "22222222-2222-2222-2222-222222222222";
const OPTION_ID = "33333333-3333-3333-3333-333333333333";
const OTHER_GROUP_ID = "44444444-4444-4444-4444-444444444444";
const CREATED_AT = "2026-01-01T00:00:00.000Z";

function makeGroup(overrides: Partial<PricingGroup> = {}): PricingGroup {
  return {
    id: GROUP_ID,
    slug: "adult-wear",
    name: "Adult Wear",
    turnaround: "2 days",
    sort_order: 2,
    is_active: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeItem(overrides: Partial<PricingItem> = {}): PricingItem {
  return {
    id: ITEM_ID,
    group_id: GROUP_ID,
    slug: "shirt-pant-t-shirt-kurta",
    name: "Shirt / Pant / T-shirt / Kurta",
    image_url: null,
    sort_order: 1,
    is_active: true,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeOption(overrides: Partial<PricingOption> = {}): PricingOption {
  return {
    id: OPTION_ID,
    item_id: ITEM_ID,
    label: "Dry Cleaning",
    original_price: 119,
    price: 99,
    unit: "piece",
    turnaround: null,
    sort_order: 0,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function groupWrite(
  overrides: Parameters<typeof updateGroup>[3] extends never
    ? never
    : Partial<Parameters<typeof updateGroup>[3]> = {},
) {
  return {
    name: "Curtain Cleaning",
    turnaround: "3 days",
    sortOrder: 9,
    isActive: true,
    ...overrides,
  };
}

function itemWrite(overrides: Partial<Parameters<typeof updateItem>[3]> = {}) {
  return {
    name: "Bedsheet / Bed cover",
    imageUrl: null,
    sortOrder: 4,
    isActive: true,
    ...overrides,
  };
}

function optionWrite(
  overrides: Partial<Parameters<typeof updateOption>[3]> = {},
) {
  return {
    label: "Steam Ironing",
    originalPrice: 40,
    price: 35,
    unit: "piece",
    turnaround: "2 days",
    sortOrder: 1,
    ...overrides,
  };
}

type Tables = {
  groups?: PricingGroup[];
  items?: PricingItem[];
  options?: PricingOption[];
};

function makeClient(seed: Tables = {}) {
  const groups = (seed.groups ?? [makeGroup()]).map((row) => ({ ...row }));
  const items = (seed.items ?? [makeItem()]).map((row) => ({ ...row }));
  const options = (seed.options ?? [makeOption()]).map((row) => ({ ...row }));
  const audits: AuditRow[] = [];

  const uniqueViolation = {
    code: "23505",
    message: "duplicate key value violates unique constraint",
  };

  function table(name: string) {
    let operation: "select" | "update" | "insert" | "delete" = "select";
    let patch: Record<string, unknown> = {};
    let inserted: Record<string, unknown> = {};
    let filterId: unknown = null;

    async function run(): Promise<{
      data: unknown;
      error: { message: string; code?: string } | null;
    }> {
      if (name === "audit_logs") {
        if (operation === "insert") audits.push(inserted as AuditRow);
        return { data: null, error: null };
      }

      if (name === "pricing_groups") {
        if (operation === "select") {
          const row = groups.find((group) => group.id === filterId);
          return { data: row ? { ...row } : null, error: null };
        }
        if (operation === "insert") {
          const slug = slugify(String(inserted.name));
          if (groups.some((group) => group.slug === slug)) {
            return { data: null, error: uniqueViolation };
          }
          const row = {
            id: `group-${groups.length + 1}`,
            slug,
            turnaround: null,
            created_at: CREATED_AT,
            updated_at: CREATED_AT,
            ...inserted,
          } as PricingGroup;
          groups.push(row);
          return { data: { ...row }, error: null };
        }
        if (operation === "update") {
          const index = groups.findIndex((group) => group.id === filterId);
          const existing = index < 0 ? null : groups[index];
          if (index < 0 || !existing) return { data: null, error: null };
          // Renames keep the stored slug, so a rename cannot clash with itself.
          const slug = slugify(String(patch.name));
          const clash = groups.some(
            (group, at) => at !== index && group.slug === slug,
          );
          if (clash) return { data: null, error: uniqueViolation };
          const row = {
            ...existing,
            ...patch,
            slug: existing.slug,
          } as PricingGroup;
          groups[index] = row;
          return { data: { ...row }, error: null };
        }
        const index = groups.findIndex((group) => group.id === filterId);
        if (index >= 0) {
          groups.splice(index, 1);
        }
        return { data: null, error: null };
      }

      if (name === "pricing_items") {
        if (operation === "select") {
          const row = items.find((item) => item.id === filterId);
          return { data: row ? { ...row } : null, error: null };
        }
        if (operation === "insert") {
          const scope = String(inserted.group_id);
          const slug = slugify(String(inserted.name));
          if (items.some((item) => item.group_id === scope && item.slug === slug)) {
            return { data: null, error: uniqueViolation };
          }
          const row = {
            id: `item-${items.length + 1}`,
            slug,
            image_url: null,
            created_at: CREATED_AT,
            updated_at: CREATED_AT,
            ...inserted,
          } as PricingItem;
          items.push(row);
          return { data: { ...row }, error: null };
        }
        if (operation === "update") {
          const index = items.findIndex((item) => item.id === filterId);
          const existing = index < 0 ? null : items[index];
          if (index < 0 || !existing) return { data: null, error: null };
          const scope = existing.group_id;
          const slug = slugify(String(patch.name));
          const clash = items.some(
            (item, at) =>
              at !== index && item.group_id === scope && item.slug === slug,
          );
          if (clash) return { data: null, error: uniqueViolation };
          const row = {
            ...existing,
            ...patch,
            slug: existing.slug,
          } as PricingItem;
          items[index] = row;
          return { data: { ...row }, error: null };
        }
        const index = items.findIndex((item) => item.id === filterId);
        if (index >= 0) items.splice(index, 1);
        return { data: null, error: null };
      }

      if (name === "pricing_options") {
        if (operation === "select") {
          const row = options.find((option) => option.id === filterId);
          return { data: row ? { ...row } : null, error: null };
        }
        if (operation === "insert") {
          const row = {
            id: `option-${options.length + 1}`,
            created_at: CREATED_AT,
            updated_at: CREATED_AT,
            ...inserted,
          } as PricingOption;
          options.push(row);
          return { data: { ...row }, error: null };
        }
        if (operation === "update") {
          const index = options.findIndex((option) => option.id === filterId);
          if (index < 0) return { data: null, error: null };
          const row = { ...options[index], ...patch } as PricingOption;
          options[index] = row;
          return { data: { ...row }, error: null };
        }
        const index = options.findIndex((option) => option.id === filterId);
        if (index >= 0) options.splice(index, 1);
        return { data: null, error: null };
      }

      return { data: null, error: null };
    }

    const api = {
      select: () => api,
      update: (values: Record<string, unknown>) => {
        operation = "update";
        patch = values;
        return api;
      },
      insert: (values: Record<string, unknown>) => {
        operation = "insert";
        inserted = values;
        return api;
      },
      delete: () => {
        operation = "delete";
        return api;
      },
      eq: (_column: string, value: unknown) => {
        filterId = value;
        return api;
      },
      async maybeSingle() {
        const { data, error } = await run();
        const row = Array.isArray(data) ? (data[0] ?? null) : data;
        return { data: row, error };
      },
      then: (resolve: (value: unknown) => unknown) => run().then(resolve),
    };

    return api;
  }

  return {
    client: { from: (name: string) => table(name) } as unknown as DbClient,
    audits,
    groups,
    items,
    options,
  };
}

describe("slugify", () => {
  it("reduces a display name to a url sludge of dashes", () => {
    expect(slugify("Adult Wear")).toBe("adult-wear");
    expect(slugify("Shirt / Pant / T-shirt / Kurta")).toBe(
      "shirt-pant-t-shirt-kurta",
    );
    expect(slugify("  Wash & Fold  ")).toBe("wash-fold");
  });
});

describe("groups", () => {
  it("derives the slug from the name at creation and audits it", async () => {
    const { client, audits, groups } = makeClient();

    const saved = await createGroup(client, "admin-1", groupWrite());

    expect(saved.slug).toBe("curtain-cleaning");
    expect(groups).toHaveLength(2);
    expect(audits[0]).toMatchObject({
      actor_id: "admin-1",
      action: "pricing.group_created",
      entity: "pricing_groups",
      entity_id: saved.id,
      before: null,
    });
    expect(audits[0]?.after).toMatchObject({ name: "Curtain Cleaning" });
  });

  it("turns a duplicate slug into a readable error", async () => {
    const { client, audits, groups } = makeClient();

    await expect(
      createGroup(client, "admin-1", groupWrite({ name: "adult wear" })),
    ).rejects.toBeInstanceOf(PricingSettingsError);

    expect(groups).toHaveLength(1);
    expect(audits).toHaveLength(0);
  });

  it("saves a rename but keeps the slug every public key already uses", async () => {
    const { client, audits, groups } = makeClient();

    const saved = await updateGroup(client, "admin-1", GROUP_ID, {
      name: "Gents & Ladies Wear",
      turnaround: "2 days",
      sortOrder: 2,
      isActive: true,
    });

    expect(saved.slug).toBe("adult-wear");
    expect(groups[0]).toMatchObject({ name: "Gents & Ladies Wear" });
    expect(audits[0]?.before).toMatchObject({ name: "Adult Wear" });
    expect(audits[0]?.after).toMatchObject({ name: "Gents & Ladies Wear" });
  });

  it("refuses, audibly, to save or delete a group that is not there", async () => {
    const { client, audits } = makeClient();
    const unknown = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";

    await expect(
      updateGroup(client, "admin-1", unknown, groupWrite()),
    ).rejects.toBeInstanceOf(PricingSettingsError);
    await expect(
      deleteGroup(client, "admin-1", unknown),
    ).rejects.toBeInstanceOf(PricingSettingsError);

    expect(audits).toHaveLength(0);
  });
});

describe("items", () => {
  it("uniqueness is per group: the same name may repeat in another category", async () => {
    const { client, items } = makeClient({
      groups: [
        makeGroup(),
        makeGroup({ id: OTHER_GROUP_ID, slug: "kids-wear", name: "Kids Wear" }),
      ],
      items: [makeItem()],
    });

    // "Shirt / Pant / T-shirt / Kurta" already lives in Adult Wear; adding it to
    // Kids Wear is legitimate, and only a same-group repeat is refused.
    const saved = await createItem(
      client,
      "admin-1",
      OTHER_GROUP_ID,
      itemWrite({ name: "Shirt / Pant / T-shirt / Kurta" }),
    );

    expect(saved.group_id).toBe(OTHER_GROUP_ID);
    expect(items).toHaveLength(2);
  });

  it("refuses a duplicate within the same group", async () => {
    const { client, audits, items } = makeClient();

    await expect(
      createItem(
        client,
        "admin-1",
        GROUP_ID,
        itemWrite({ name: "shirt/pant/t-shirt/kurta" }),
      ),
    ).rejects.toBeInstanceOf(PricingSettingsError);

    expect(items).toHaveLength(1);
    expect(audits).toHaveLength(0);
  });

  it("saves an edit and audits a real before and after", async () => {
    const { client, audits, items } = makeClient();

    const saved = await updateItem(client, "admin-1", ITEM_ID, itemWrite());

    expect(items[0]).toMatchObject({ name: "Bedsheet / Bed cover" });
    expect(saved.slug).toBe("shirt-pant-t-shirt-kurta");
    expect(audits[0]?.action).toBe("pricing.item_updated");
    expect(audits[0]?.before).toMatchObject({ name: "Shirt / Pant / T-shirt / Kurta" });
    expect(audits[0]?.after).toMatchObject({ name: "Bedsheet / Bed cover" });
  });

  it("audits what a deletion removes", async () => {
    const { client, audits, items } = makeClient();

    await deleteItem(client, "admin-1", ITEM_ID);

    expect(items).toHaveLength(0);
    expect(audits[0]).toMatchObject({
      action: "pricing.item_deleted",
      entity_id: ITEM_ID,
      after: null,
    });
    expect(audits[0]?.before).toMatchObject({ slug: "shirt-pant-t-shirt-kurta" });
  });
});

describe("options", () => {
  it("adds a priced line and audits it", async () => {
    const { client, audits, options } = makeClient();

    const saved = await createOption(
      client,
      "admin-1",
      ITEM_ID,
      optionWrite({ label: null, price: 90, originalPrice: 90 }),
    );

    expect(options).toHaveLength(2);
    expect(audits[0]?.action).toBe("pricing.option_created");
    expect(audits[0]?.after).toMatchObject({ price: 90, label: null });
    expect(saved.unit).toBe("piece");
  });

  it("saves a price change with a real before snapshot", async () => {
    const { client, audits, options } = makeClient();

    await updateOption(
      client,
      "admin-1",
      OPTION_ID,
      optionWrite({ price: 109, originalPrice: 119 }),
    );

    expect(options[0]).toMatchObject({ price: 109 });
    expect(audits[0]?.before).toMatchObject({ price: 99 });
    expect(audits[0]?.after).toMatchObject({ price: 109 });
  });

  it("removes a priced line and audits what it carried", async () => {
    const { client, audits, options } = makeClient();

    await deleteOption(client, "admin-1", OPTION_ID);

    expect(options).toHaveLength(0);
    expect(audits[0]).toMatchObject({
      action: "pricing.option_deleted",
      after: null,
    });
    expect(audits[0]?.before).toMatchObject({ label: "Dry Cleaning", price: 99 });
  });

  it("refuses to touch a price that is not there", async () => {
    const { client, audits } = makeClient();
    const unknown = "ffffffff-ffff-ffff-ffff-ffffffffffff";

    await expect(
      updateOption(client, "admin-1", unknown, optionWrite()),
    ).rejects.toBeInstanceOf(PricingSettingsError);
    await expect(
      deleteOption(client, "admin-1", unknown),
    ).rejects.toBeInstanceOf(PricingSettingsError);

    expect(audits).toHaveLength(0);
  });
});
