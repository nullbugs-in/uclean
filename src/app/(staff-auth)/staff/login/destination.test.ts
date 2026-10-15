import { describe, expect, it } from "vitest";

import {
  isPanelRole,
  resolveDestination,
  safeRedirectTarget,
} from "./destination";

describe("isPanelRole", () => {
  it("admits staff and admin", () => {
    expect(isPanelRole("staff")).toBe(true);
    expect(isPanelRole("admin")).toBe(true);
  });

  it("turns away customers and missing roles", () => {
    expect(isPanelRole("customer")).toBe(false);
    expect(isPanelRole(null)).toBe(false);
    expect(isPanelRole(undefined)).toBe(false);
  });
});

describe("safeRedirectTarget", () => {
  it("keeps paths inside the panels this app owns", () => {
    expect(safeRedirectTarget("/staff/orders/123")).toBe("/staff/orders/123");
    expect(safeRedirectTarget("/staff/pickups")).toBe("/staff/pickups");
    expect(safeRedirectTarget("/admin")).toBe("/admin");
    expect(safeRedirectTarget("/admin/orders")).toBe("/admin/orders");
  });

  it("refuses anything that could become an open redirect", () => {
    expect(safeRedirectTarget("//evil.example.com")).toBeUndefined();
    expect(safeRedirectTarget("https://evil.example.com")).toBeUndefined();
    expect(safeRedirectTarget("/staffx")).toBeUndefined();
    expect(safeRedirectTarget("staff/orders")).toBeUndefined();
    expect(safeRedirectTarget("/account/orders")).toBeUndefined();
    expect(safeRedirectTarget("/")).toBeUndefined();
  });

  it("drops a bounce back to the sign-in page itself", () => {
    expect(safeRedirectTarget("/staff/login")).toBeUndefined();
  });

  it("treats a missing parameter as no destination", () => {
    expect(safeRedirectTarget(undefined)).toBeUndefined();
    expect(safeRedirectTarget("")).toBeUndefined();
  });
});

describe("resolveDestination", () => {
  it("sends staff to the requested staff page", () => {
    expect(resolveDestination("staff", "/staff/orders/123")).toBe(
      "/staff/orders/123",
    );
  });

  it("sends admin to admin and staff pages alike", () => {
    expect(resolveDestination("admin", "/admin/orders")).toBe("/admin/orders");
    expect(resolveDestination("admin", "/staff/pickups")).toBe(
      "/staff/pickups",
    );
  });

  it("falls back to the role's own panel", () => {
    expect(resolveDestination("staff")).toBe("/staff");
    expect(resolveDestination("admin")).toBe("/admin");
  });

  it("will not let staff be pushed into the admin panel", () => {
    expect(resolveDestination("staff", "/admin/orders")).toBe("/staff");
  });

  it("will not follow a destination outside the panels", () => {
    expect(resolveDestination("admin", "//evil.example.com")).toBe("/admin");
    expect(resolveDestination("staff", "/account/orders")).toBe("/staff");
    expect(resolveDestination("staff", "/staff/login")).toBe("/staff");
  });
});
