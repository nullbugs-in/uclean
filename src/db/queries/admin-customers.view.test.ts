import { describe, expect, it } from "vitest";

import type { Profile } from "@/db/types";

import {
  CUSTOMER_SORTS,
  attachOrderStats,
  customerFilterHref,
  customerSearchOrClause,
  readCustomerFilter,
  summarizeCustomerOrders,
} from "./admin-customers.view";

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "c1",
    full_name: "Asha Menon",
    mobile: "+919876543210",
    email: "asha@example.com",
    whatsapp_number: "+919876543210",
    role: "customer",
    is_active: true,
    can_view_all_orders: false,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    ...overrides,
  };
}

function order(
  overrides: Partial<{
    customer_id: string;
    created_at: string;
    status: string;
  }> = {},
) {
  return {
    customer_id: "c1",
    created_at: "2026-03-02T00:00:00Z",
    status: "pickup_requested",
    ...overrides,
  } as {
    customer_id: string;
    created_at: string;
    status: "pickup_requested";
  };
}

describe("readCustomerFilter", () => {
  it("defaults to newest first on page 1 with no search", () => {
    expect(readCustomerFilter({})).toEqual({
      search: undefined,
      sort: "newest",
      page: 1,
    });
  });

  it("keeps a real search and sort", () => {
    expect(
      readCustomerFilter({ q: "asha", sort: "oldest", page: "3" }),
    ).toEqual({
      search: "asha",
      sort: "oldest",
      page: 3,
    });
  });

  it("rejects an unknown sort rather than letting it reach the query", () => {
    expect(readCustomerFilter({ sort: "created_at;drop table" })).toMatchObject({
      sort: "newest",
    });
  });

  it("rejects a non-numeric or negative page rather than passing NaN to an offset", () => {
    expect(readCustomerFilter({ page: "abc" }).page).toBe(1);
    expect(readCustomerFilter({ page: "-4" }).page).toBe(1);
    expect(readCustomerFilter({ page: "0" }).page).toBe(1);
  });

  it("takes the first value when a param is repeated", () => {
    expect(readCustomerFilter({ q: ["asha", "nair"] }).search).toBe("asha");
  });

  it("trims a search down to undefined when it is only whitespace", () => {
    expect(readCustomerFilter({ q: "   " }).search).toBeUndefined();
  });

  it("only offers sorts it knows how to order by", () => {
    const ids = CUSTOMER_SORTS.map((entry) => entry.id);
    for (const id of ids) {
      expect(readCustomerFilter({ sort: id }).sort).toBe(id);
    }
  });
});

describe("customerFilterHref", () => {
  it("reads a plain list back as the bare path", () => {
    expect(customerFilterHref({ search: undefined, sort: "newest", page: 1 })).toBe(
      "/admin/customers",
    );
  });

  it("keeps the search and drops the default sort and page", () => {
    expect(customerFilterHref({ search: "asha" })).toBe(
      "/admin/customers?q=asha",
    );
  });

  it("carries a sort and page across, so pagination does not lose the filter", () => {
    expect(
      customerFilterHref({ search: "asha", sort: "name", page: 3 }),
    ).toBe("/admin/customers?q=asha&sort=name&page=3");
  });

  it("encodes a search that needs it", () => {
    expect(customerFilterHref({ search: "a b" })).toBe(
      "/admin/customers?q=a+b",
    );
  });

  it("applies overrides without mutating the filter it was given", () => {
    const filter = { search: "asha", sort: "newest", page: 5 } as const;

    expect(customerFilterHref(filter, { page: 1 })).toBe(
      "/admin/customers?q=asha",
    );
    expect(filter.page).toBe(5);
  });

  it("returns to the first page when an override clears the search", () => {
    expect(
      customerFilterHref({ search: "asha", sort: "oldest" }, { search: undefined }),
    ).toBe("/admin/customers?sort=oldest");
  });
});

describe("customerSearchOrClause", () => {
  it("returns null for an empty or whitespace-only search", () => {
    expect(customerSearchOrClause(undefined)).toBeNull();
    expect(customerSearchOrClause("")).toBeNull();
    expect(customerSearchOrClause("   ")).toBeNull();
  });

  it("ignores a single character, which is a keystroke on the way to a name", () => {
    expect(customerSearchOrClause("a")).toBeNull();
  });

  it("searches name, mobile, WhatsApp and email in one group", () => {
    const clause = customerSearchOrClause("asha");

    expect(clause).toContain("full_name.ilike.%asha%");
    expect(clause).toContain("mobile.ilike.%asha%");
    expect(clause).toContain("whatsapp_number.ilike.%asha%");
    expect(clause).toContain("email.ilike.%asha%");
  });

  it("escapes a wildcard so a typed % cannot widen the match back to everyone", () => {
    expect(customerSearchOrClause("asha%")).toContain("asha\\%");
    expect(customerSearchOrClause("a_b")).toContain("a\\_b");
  });

  it("keeps every term of a multi-word search", () => {
    const clause = customerSearchOrClause("asha menon") ?? "";

    expect(clause).toContain("asha");
    expect(clause).toContain("menon");
  });
});

describe("attachOrderStats", () => {
  it("gives a customer with no orders a zero count and no last order", () => {
    const [row] = attachOrderStats([profile()], []);

    expect(row?.orderCount).toBe(0);
    expect(row?.lastOrderAt).toBeNull();
    expect(row?.lastOrderStatus).toBeNull();
  });

  it("counts a customer's orders and keeps the newest", () => {
    const [row] = attachOrderStats(
      [profile()],
      [
        order({ created_at: "2026-03-02T00:00:00Z", status: "pickup_requested" }),
        order({ created_at: "2026-03-05T00:00:00Z", status: "delivered" }),
      ],
    );

    expect(row?.orderCount).toBe(2);
    expect(row?.lastOrderAt).toBe("2026-03-05T00:00:00Z");
    expect(row?.lastOrderStatus).toBe("delivered");
  });

  it("does not let an older order overwrite a newer one, whatever order rows arrive in", () => {
    const [row] = attachOrderStats(
      [profile()],
      [
        order({ created_at: "2026-03-05T00:00:00Z", status: "delivered" }),
        order({ created_at: "2026-03-02T00:00:00Z", status: "pickup_requested" }),
      ],
    );

    expect(row?.lastOrderAt).toBe("2026-03-05T00:00:00Z");
    expect(row?.lastOrderStatus).toBe("delivered");
  });

  it("keeps each customer's orders separate when several share a page", () => {
    const rows = attachOrderStats(
      [profile({ id: "c1" }), profile({ id: "c2" })],
      [
        order({ customer_id: "c1", created_at: "2026-03-01T00:00:00Z" }),
        order({ customer_id: "c1", created_at: "2026-03-03T00:00:00Z" }),
        order({ customer_id: "c2", created_at: "2026-03-02T00:00:00Z" }),
      ],
    );

    expect(rows.map((row) => row.orderCount)).toEqual([2, 1]);
    expect(rows[0]?.lastOrderAt).toBe("2026-03-03T00:00:00Z");
    expect(rows[1]?.lastOrderAt).toBe("2026-03-02T00:00:00Z");
  });

  it("leaves the profile row itself untouched", () => {
    const original = profile();
    const [row] = attachOrderStats([original], [order()]);

    expect(row).toMatchObject({
      id: original.id,
      full_name: original.full_name,
      mobile: original.mobile,
      is_active: original.is_active,
    });
  });
});

describe("summarizeCustomerOrders", () => {
  it("reports zeroes and no last order for a customer who has never booked", () => {
    expect(summarizeCustomerOrders([])).toEqual({
      total: 0,
      delivered: 0,
      cancelled: 0,
      open: 0,
      lastOrderAt: null,
    });
  });

  it("splits open, delivered and cancelled so the three add up to the total", () => {
    const summary = summarizeCustomerOrders([
      { status: "pickup_requested", created_at: "2026-03-01T00:00:00Z" },
      { status: "in_process", created_at: "2026-03-02T00:00:00Z" },
      { status: "delivered", created_at: "2026-03-03T00:00:00Z" },
      { status: "cancelled", created_at: "2026-03-04T00:00:00Z" },
    ]);

    expect(summary.total).toBe(4);
    expect(summary.open).toBe(2);
    expect(summary.delivered).toBe(1);
    expect(summary.cancelled).toBe(1);
    expect(summary.open + summary.delivered + summary.cancelled).toBe(
      summary.total,
    );
  });

  it("takes the newest booking as the last one, in any input order", () => {
    const summary = summarizeCustomerOrders([
      { status: "delivered", created_at: "2026-03-09T00:00:00Z" },
      { status: "pickup_requested", created_at: "2026-03-12T00:00:00Z" },
    ]);

    expect(summary.lastOrderAt).toBe("2026-03-12T00:00:00Z");
  });

  it("treats every non-terminal status as still open", () => {
    const summary = summarizeCustomerOrders([
      { status: "agent_assigned", created_at: "2026-03-01T00:00:00Z" },
      { status: "paid", created_at: "2026-03-02T00:00:00Z" },
      { status: "out_for_delivery", created_at: "2026-03-03T00:00:00Z" },
    ]);

    expect(summary.open).toBe(3);
    expect(summary.delivered).toBe(0);
    expect(summary.cancelled).toBe(0);
  });
});
