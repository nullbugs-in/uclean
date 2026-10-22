import { describe, expect, it } from "vitest";

import type { Invoice } from "@/db/types";

import {
  applyInvoiceStatusFilter,
  assembleInvoiceRows,
  countInvoices,
  invoiceFilterHref,
  matchesInvoiceSearch,
  readInvoiceStatusFilter,
  type InvoiceRow,
} from "./billing.view";

function invoice(overrides: Partial<Invoice> = {}): InvoiceRow {
  return {
    id: "i1",
    order_id: "o1",
    invoice_no: "UC-INV-0001",
    customer_name: "Asha Nair",
    customer_mobile: "+919876543210",
    billing_address: "Banashankari",
    subtotal: 900,
    tax: 0,
    discount: 0,
    delivery_charge: 40,
    total: 940,
    status: "sent",
    analysis_note: null,
    pay_token: "tok_i1",
    pay_token_expires_at: null,
    sent_at: null,
    paid_at: null,
    created_by: null,
    created_at: "2026-03-01T00:00:00Z",
    updated_at: "2026-03-01T00:00:00Z",
    order_no: "UC-2026-000001",
    order_status: "under_analysis",
    ...overrides,
  } as InvoiceRow;
}

describe("assembleInvoiceRows", () => {
  it("stitches the booking's number and stage beside the bill", () => {
    const [row] = assembleInvoiceRows(
      [invoice({ order_id: "o9" })],
      [{ id: "o9", order_no: "UC-2026-000002", status: "invoice_sent" }],
    );

    expect(row?.order_no).toBe("UC-2026-000002");
    expect(row?.order_status).toBe("invoice_sent");
  });

  /**
   * An order the book no longer holds must not drop its invoice — the bill is
   * the record that matters — so it keeps the invoice with the bare id.
   */
  it("keeps an invoice whose order is missing", () => {
    const [row] = assembleInvoiceRows([invoice({ order_id: "o9" })], []);

    expect(row?.order_no).toBe("o9");
    expect(row?.order_status).toBe("pickup_requested");
  });
});

describe("readInvoiceStatusFilter", () => {
  it("accepts a chip value from the URL", () => {
    expect(readInvoiceStatusFilter("paid")).toBe("paid");
  });

  it("falls back to all for anything unknown", () => {
    expect(readInvoiceStatusFilter("hacked")).toBe("all");
    expect(readInvoiceStatusFilter(["sent"])).toBe("sent");
    expect(readInvoiceStatusFilter(undefined)).toBe("all");
  });
});

describe("invoiceFilterHref", () => {
  it("links the all chip to the bare page", () => {
    expect(invoiceFilterHref("all")).toBe("/admin/billing");
  });

  it("carries the other chips as status", () => {
    expect(invoiceFilterHref("draft")).toBe("/admin/billing?status=draft");
  });
});

describe("applyInvoiceStatusFilter", () => {
  const rows = [
    invoice({ id: "i1", status: "draft" }),
    invoice({ id: "i2", status: "sent" }),
    invoice({ id: "i3", status: "paid" }),
    invoice({ id: "i4", status: "void" }),
  ] as InvoiceRow[];

  it("returns everything for all", () => {
    expect(applyInvoiceStatusFilter(rows, "all")).toHaveLength(4);
  });

  it("picks exactly one stage for the others", () => {
    expect(applyInvoiceStatusFilter(rows, "draft").map((r) => r.id)).toEqual([
      "i1",
    ]);
    expect(applyInvoiceStatusFilter(rows, "sent").map((r) => r.id)).toEqual([
      "i2",
    ]);
    expect(applyInvoiceStatusFilter(rows, "paid").map((r) => r.id)).toEqual([
      "i3",
    ]);
    expect(applyInvoiceStatusFilter(rows, "void").map((r) => r.id)).toEqual([
      "i4",
    ]);
  });
});

describe("matchesInvoiceSearch", () => {
  const row = invoice();

  it("falls through without terms", () => {
    expect(matchesInvoiceSearch(row, [])).toBe(true);
  });

  it("matches across invoice number, booking number and customer", () => {
    expect(matchesInvoiceSearch(row, ["inv-0001"])).toBe(true);
    expect(matchesInvoiceSearch(row, ["uc-2026"])).toBe(true);
    expect(matchesInvoiceSearch(row, ["asha"])).toBe(true);
  });

  it("narrows with extra words instead of widening", () => {
    expect(matchesInvoiceSearch(row, ["asha", "0001"])).toBe(true);
    expect(matchesInvoiceSearch(row, ["asha", "floor"])).toBe(false);
  });

  it("ignores one-character terms", () => {
    expect(matchesInvoiceSearch(row, ["a"])).toBe(true);
  });
});

describe("countInvoices", () => {
  it("counts every stage and sums the money", () => {
    const rows = [
      invoice({ id: "i1", status: "draft", total: 999 }),
      invoice({ id: "i2", status: "sent", total: 500 }),
      invoice({ id: "i3", status: "paid", total: 300 }),
      invoice({ id: "i4", status: "paid", total: 200 }),
      invoice({ id: "i5", status: "void", total: 800 }),
    ] as InvoiceRow[];

    expect(countInvoices(rows)).toEqual({
      all: 5,
      draft: 1,
      sent: 1,
      paid: 2,
      void: 1,
      billed: 1000,
      collected: 500,
    });
  });
});
