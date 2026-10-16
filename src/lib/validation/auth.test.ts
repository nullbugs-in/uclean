import { describe, expect, it } from "vitest";

import {
  autoRequestSchema,
  loginRequestSchema,
  signUpSchema,
  signupRequestSchema,
  verifyOtpSchema,
} from "./auth";

describe("signupRequestSchema", () => {
  it("canonicalises the number it accepts", () => {
    const parsed = signupRequestSchema.parse({
      intent: "signup",
      fullName: "Asha Menon",
      mobile: "098765 43210",
    });

    expect(parsed.mobile).toBe("+919876543210");
    expect(parsed.fullName).toBe("Asha Menon");
  });

  it("trims the name", () => {
    const parsed = signupRequestSchema.parse({
      intent: "signup",
      fullName: "  Asha Menon  ",
      mobile: "9876543210",
    });

    expect(parsed.fullName).toBe("Asha Menon");
  });

  it("requires a name", () => {
    const parsed = signupRequestSchema.safeParse({
      intent: "signup",
      fullName: "A",
      mobile: "9876543210",
    });

    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed number", () => {
    const parsed = signupRequestSchema.safeParse({
      intent: "signup",
      fullName: "Asha Menon",
      mobile: "12345",
    });

    expect(parsed.success).toBe(false);
  });
});

describe("loginRequestSchema", () => {
  it("takes a number and nothing else", () => {
    // A name must not be accepted here: it is how a login would come to
    // overwrite an existing customer's name.
    const parsed = loginRequestSchema.safeParse({
      intent: "login",
      mobile: "9876543210",
      fullName: "Someone Else",
    });

    // Unknown keys are stripped, not rejected, but the name cannot reach the
    // send path because the action builds the payload from the parsed result.
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual({
        intent: "login",
        mobile: "+919876543210",
      });
    }
  });

  it("canonicalises the number it accepts", () => {
    const parsed = loginRequestSchema.parse({
      intent: "login",
      mobile: "919876543210",
    });

    expect(parsed.mobile).toBe("+919876543210");
  });
});

describe("autoRequestSchema", () => {
  it("accepts a name alongside the number, for the wizard", () => {
    const parsed = autoRequestSchema.parse({
      intent: "auto",
      fullName: "Asha Menon",
      mobile: "9876543210",
    });

    expect(parsed.mobile).toBe("+919876543210");
  });
});

describe("signUpSchema", () => {
  it("canonicalises the number, so the wizard and the auth pages agree", () => {
    const parsed = signUpSchema.parse({
      fullName: "Asha Menon",
      mobile: "9876543210",
    });

    expect(parsed.mobile).toBe("+919876543210");
  });
});

describe("verifyOtpSchema", () => {
  it("defaults to the login intent", () => {
    const parsed = verifyOtpSchema.parse({
      mobile: "9876543210",
      token: "123456",
    });

    expect(parsed.intent).toBe("login");
  });

  it("carries the signup intent through", () => {
    const parsed = verifyOtpSchema.parse({
      mobile: "9876543210",
      token: "123456",
      intent: "signup",
      fullName: "Asha Menon",
    });

    expect(parsed.intent).toBe("signup");
    expect(parsed.mobile).toBe("+919876543210");
  });

  it("requires exactly six digits", () => {
    expect(
      verifyOtpSchema.safeParse({ mobile: "9876543210", token: "12345" })
        .success,
    ).toBe(false);
    expect(
      verifyOtpSchema.safeParse({ mobile: "9876543210", token: "1234567" })
        .success,
    ).toBe(false);
  });

  it("rejects a mobile that cannot be canonicalised", () => {
    expect(
      verifyOtpSchema.safeParse({ mobile: "abc", token: "123456" }).success,
    ).toBe(false);
  });
});
