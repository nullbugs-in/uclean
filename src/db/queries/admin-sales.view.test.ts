import { describe, expect, it } from "vitest";

import type {
  Invoice,
  OrderItem,
  Payment,
  PickupAssignment,
  Profile,
} from "@/db/types";

import {
  buildSalesCsv,
  buildSalesReport,
  filterPaidInvoices,
  periodWindow,
  windowLabel,
  type SalesWindow,
} from "./admin-sales.view";

/*
 * Timestamps sit at noon UTC on purpose: that is the one time of day which falls
 * on the same local date in every zone a runner will actually use, so a test
 * that asserts a day boundary cannot pass in UTC and fail in IST.
 */

function invoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: "inv1",
    order_id: "o1",
    invoice_no: "INV-0001",
    customer_name: "Asha Menon",
    customer_mobile: "+919876543210",
    billing_address: "2979/1, D21/1, 6th Main Rd",
    subtotal: 160,
    tax: 0,
    discount: 0,
    delivery_charge: 0,
    total: 160,
    status: "paid",
    pay_token: null,
    pay_token_expires_at: null,
    sent_at: "2026-03-02T00:00:00Z",
    paid_at: "2026-03-03T12:00:00Z",
    created_by: "admin1",
    created_at: "2026-03-02T00:00:00Z",
    updated_at: "2026-03-03T00:00:00Z",
    ...overrides,
  } as Invoice;
}

function item(overrides: Partial<OrderItem> = {}): OrderItem {
  return {
    id: "i1",
    order_id: "o1",
    item_name: "Wash and Iron",
    qty: 2,
    unit_price: 80,
    notes: null,
    photo_url: null,
    ...overrides,
  } as OrderItem;
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "p1",
    invoice_id: "inv1",
    mode: "cod",
    gateway_payment_id: null,
    gateway_order_id: null,
    gateway_signature_valid: null,
    amount: 160,
    status: "collected",
    collected_by: "staff1",
    collected_at: "2026-03-03T12:00:00Z",
    failure_reason: null,
    created_at: "2026-03-03T12:00:00Z",
    updated_at: "2026-03-03T12:00:00Z",
    ...overrides,
  } as Payment;
}

function assignment(overrides: Partial<PickupAssignment> = {}): PickupAssignment {
  return {
    id: "pa1",
    order_id: "o1",
    agent_id: "a1",
    type: "delivery",
    status: "assigned",
    assigned_by_type: "manual",
    assigned_by: "admin1",
    assigned_at: "2026-03-01T00:00:00Z",
    completed_at: null,
    ...overrides,
  };
}

const AGENT: Pick<Profile, "id" | "full_name"> = {
  id: "a1",
  full_name: "Ravi Kumar",
};

const ALL_TIME: SalesWindow = { from: null, to: null };

function report(overrides: {
  invoices: Invoice[];
  items?: OrderItem[];
  payments?: Payment[];
  assignments?: PickupAssignment[];
  agents?: Pick<Profile, "id" | "full_name">[];
}) {
  return buildSalesReport({
    invoices: overrides.invoices,
    items: overrides.items ?? [],
    payments: overrides.payments ?? [],
    assignments: overrides.assignments ?? [],
    agents: overrides.agents ?? [],
    window: ALL_TIME,
  });
}

describe("periodWindow", () => {
  it("counts today as part of the period", () => {
    expect(periodWindow("7d", "2026-03-16")).toEqual({
      from: "2026-03-10",
      to: "2026-03-16",
    });
  });

  it("spans a month without going out of order", () => {
    expect(periodWindow("30d", "2026-03-16")).toEqual({
      from: "2026-02-15",
      to: "2026-03-16",
    });
  });

  it("has no bounds at all for all time", () => {
    expect(periodWindow("all", "2026-03-16")).toEqual({
      from: null,
      to: null,
    });
  });
});

describe("filterPaidInvoices", () => {
  it("passes everything through for all time", () => {
    const invoices = [invoice({ id: "inv1" }), invoice({ id: "inv2" })];

    expect(filterPaidInvoices(invoices, ALL_TIME)).toHaveLength(2);
  });

  it("keeps the first and last day of the window in full", () => {
    const window = periodWindow("7d", "2026-03-16");

    const result = filterPaidInvoices(
      [
        invoice({ id: "inv1", paid_at: "2026-03-10T12:00:00Z" }),
        invoice({ id: "inv2", paid_at: "2026-03-16T12:00:00Z" }),
      ],
      window,
    );

    expect(result.map((row) => row.id)).toEqual(["inv1", "inv2"]);
  });

  it("drops anything paid a day either side", () => {
    const window = periodWindow("7d", "2026-03-16");

    const result = filterPaidInvoices(
      [
        invoice({ id: "inv1", paid_at: "2026-03-09T12:00:00Z" }),
        invoice({ id: "inv2", paid_at: "2026-03-17T12:00:00Z" }),
      ],
      window,
    );

    expect(result).toHaveLength(0);
  });

  /**
   * A paid invoice with no `paid_at` cannot be placed in any window. Reading the
   * missing timestamp as "the beginning of time" would put it in every report
   * ever run, which is worse than not counting it at all.
   */
  it("skips a paid invoice that has no timestamp", () => {
    expect(
      filterPaidInvoices(
        [invoice({ paid_at: null })],
        periodWindow("7d", "2026-03-16"),
      ),
    ).toHaveLength(0);
  });
});

describe("buildSalesReport", () => {
  it("sums the invoice totals, not the lines", () => {
    const result = report({
      invoices: [invoice({ id: "inv1", total: 160 }), invoice({ id: "inv2", order_id: "o2", total: 240 })],
    });

    expect(result.totals).toEqual({ revenue: 400, invoices: 2, average: 200 });
  });

  it("reports no average rather than a divide by zero", () => {
    expect(report({ invoices: [] }).totals).toEqual({
      revenue: 0,
      invoices: 0,
      average: 0,
    });
  });

  it("totals nothing when nothing has been paid", () => {
    expect(report({ invoices: [] }).totals.revenue).toBe(0);
  });

  it("groups the lines by service and sorts by what earned most", () => {
    const result = report({
      invoices: [invoice()],
      items: [
        item({ id: "i1", item_name: "Wash and Iron", qty: 2, unit_price: 80 }),
        item({ id: "i2", item_name: "Wash and Iron", qty: 1, unit_price: 80 }),
        item({ id: "i3", item_name: "Dry Cleaning", qty: 1, unit_price: 300 }),
      ],
    });

    expect(result.byService).toEqual([
      { itemName: "Dry Cleaning", qty: 1, revenue: 300 },
      { itemName: "Wash and Iron", qty: 3, revenue: 240 },
    ]);
  });

  /**
   * The lines of an order that was never paid are not revenue, even though the
   * query returns them next to the ones that are.
   */
  it("ignores the lines of an order that was not paid", () => {
    const result = report({
      invoices: [invoice()],
      items: [
        item({ id: "i1", order_id: "o1", item_name: "Wash and Iron" }),
        item({ id: "i2", order_id: "o9", item_name: "Dry Cleaning" }),
      ],
    });

    expect(result.byService.map((row) => row.itemName)).toEqual(["Wash and Iron"]);
  });

  it("groups by the mode that settled the invoice", () => {
    const result = report({
      invoices: [invoice({ id: "inv1" }), invoice({ id: "inv2", order_id: "o2", total: 240 })],
      payments: [
        payment({ id: "p1", invoice_id: "inv1", mode: "cod", amount: 160 }),
        payment({ id: "p2", invoice_id: "inv2", mode: "upi", amount: 240 }),
      ],
    });

    expect(result.byMode).toEqual([
      { mode: "upi", count: 1, revenue: 240 },
      { mode: "cod", count: 1, revenue: 160 },
    ]);
  });

  it("counts a pending or failed payment as no mode at all", () => {
    const result = report({
      invoices: [invoice()],
      payments: [
        payment({ status: "pending" }),
        payment({ id: "p2", status: "failed", mode: "card" }),
      ],
    });

    expect(result.byMode).toEqual([
      { mode: "unknown", count: 1, revenue: 160 },
    ]);
  });

  it("keeps a paid invoice that has no payment row, under unknown", () => {
    const result = report({ invoices: [invoice()] });

    expect(result.byMode).toEqual([
      { mode: "unknown", count: 1, revenue: 160 },
    ]);
  });

  it("attributes a delivery to the agent who carried it", () => {
    const result = report({
      invoices: [invoice()],
      assignments: [assignment()],
      agents: [AGENT],
    });

    expect(result.byAgent).toEqual([
      { agentId: "a1", fullName: "Ravi Kumar", orders: 1, revenue: 160 },
    ]);
  });

  it("reads a removed agent by name rather than dropping the row", () => {
    const result = report({
      invoices: [invoice()],
      assignments: [assignment({ agent_id: "a1" })],
      agents: [],
    });

    expect(result.byAgent).toEqual([
      { agentId: "a1", fullName: "Agent removed", orders: 1, revenue: 160 },
    ]);
  });

  it("lands a delivery with no agent under Unassigned", () => {
    const result = report({
      invoices: [invoice()],
      assignments: [],
      agents: [AGENT],
    });

    expect(result.byAgent).toEqual([
      { agentId: null, fullName: "Unassigned", orders: 1, revenue: 160 },
    ]);
  });

  it("ignores the pickup leg and a cancelled delivery", () => {
    const result = report({
      invoices: [invoice()],
      assignments: [
        assignment({ id: "pa1", type: "pickup", agent_id: "a2" }),
        assignment({ id: "pa2", type: "delivery", agent_id: "a3", status: "cancelled" }),
      ],
      agents: [AGENT],
    });

    expect(result.byAgent.map((row) => row.fullName)).toEqual(["Unassigned"]);
  });
});

describe("buildSalesCsv", () => {
  it("puts all three breakdowns in one file", () => {
    const csv = buildSalesCsv(
      report({
        invoices: [invoice()],
        items: [item()],
        payments: [payment()],
        assignments: [assignment()],
        agents: [AGENT],
      }),
    );

    expect(csv).toContain("By service");
    expect(csv).toContain("By payment mode");
    expect(csv).toContain("By delivery agent");
    expect(csv).toContain("Ravi Kumar");
  });

  /** A service name with a comma must not shift the columns under it. */
  it("quotes every cell and doubles a quote inside one", () => {
    const csv = buildSalesCsv(
      report({
        invoices: [invoice()],
        items: [item({ item_name: 'Wash, "and" Iron' })],
      }),
    );

    expect(csv).toContain('"Wash, ""and"" Iron"');
  });

  it("uses the platform line ending so a spreadsheet opens it", () => {
    const csv = buildSalesCsv(report({ invoices: [invoice()] }));

    expect(csv).toContain("\r\n");
    expect(csv.split("\r\n")).toContain('"Total","160"');
  });
});

describe("windowLabel", () => {
  it("names the range", () => {
    expect(windowLabel({ from: "2026-03-10", to: "2026-03-16" })).toBe(
      "2026-03-10 to 2026-03-16",
    );
  });

  it("says what it means for all time", () => {
    expect(windowLabel(ALL_TIME)).toBe("All time");
  });
});
