import { describe, expect, it } from "vitest";

import { decideWalkInCustomer } from "./admin-walk-in";

/**
 * The decision behind a walk-in is the only part of this module with a rule in
 * it, so it is the part worth pinning down. The queries around it are plumbing
 * that a database would be needed to test, and they contain no judgement.
 */

const CUSTOMER = {
  id: "c1",
  full_name: "Asha Menon",
  role: "customer" as const,
};

describe("decideWalkInCustomer", () => {
  it("creates an account for a number nobody has used", () => {
    expect(decideWalkInCustomer(null, "  Asha Menon  ")).toEqual({
      action: "create",
      fullName: "Asha Menon",
    });
  });

  it("reuses an existing customer rather than making a second account", () => {
    expect(decideWalkInCustomer(CUSTOMER, "Asha M")).toEqual({
      action: "reuse",
      profileId: "c1",
      fullName: "Asha Menon",
    });
  });

  /**
   * The typed name loses. The counter types a name to fill a form, not to rename
   * the customer, and the receipt has to agree with the account.
   */
  it("keeps the name on file when the counter types a different one", () => {
    const decision = decideWalkInCustomer(CUSTOMER, "Totally Different Name");

    expect(decision).toMatchObject({ fullName: "Asha Menon" });
  });

  it("refuses a staff number", () => {
    expect(
      decideWalkInCustomer({ id: "s1", full_name: "Ravi", role: "staff" }, "Ravi"),
    ).toEqual({ action: "reject" });
  });

  it("refuses an admin number", () => {
    expect(
      decideWalkInCustomer({ id: "a1", full_name: "Owner", role: "admin" }, "Owner"),
    ).toEqual({ action: "reject" });
  });
});
