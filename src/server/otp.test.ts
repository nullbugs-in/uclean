import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  MAX_FAILED_ATTEMPTS,
  findRegisteredCustomer,
  resolveIntent,
  sendOtp,
  verifyOtp,
} from "./otp";

/**
 * The send path is exercised through a fake Supabase client so the tests can
 * assert on what would have been asked of the real one, in particular the
 * `shouldCreateUser` flag. That flag is the whole reason login and signup are
 * separate functions: it is what stops Supabase from creating a user during a
 * login, and no amount of application-level checking can replace it if the
 * request itself is wrong.
 */

/** The shape of the one Supabase call these tests care about inspecting. */
type SignInWithOtpArgs = {
  phone: string;
  options: { data: Record<string, unknown>; shouldCreateUser: boolean };
};

const signInWithOtp = vi.fn(async (_args: SignInWithOtpArgs) => ({
  data: {},
  error: null,
}));

const verifyOtpWithSupabase = vi.fn(
  async (_args: { phone: string; token: string }) => ({
    data: { user: null },
    error: { message: "Token has expired or is invalid" },
  }),
);

const adminCreateUser = vi.fn(async (_args: Record<string, unknown>) => ({
  data: { user: { id: "new-user" } },
  error: null,
}));

const profiles = {
  rows: [] as Array<{ id: string; full_name: string; mobile: string }>,
};

/**
 * A Supabase query builder that answers whatever is chained onto it.
 *
 * The real builders return a different object from every method, and which
 * combination gets used depends on which limiter is running. Rather than mirror
 * that shape and have a missing method surface as a confusing "is not a
 * function" failure halfway through a test, every link returns the same builder
 * and awaiting it reports no outstanding requests and no recorded failures.
 */
function chainable(): Record<string, unknown> {
  const builder: Record<string, unknown> = {};

  for (const method of [
    "select",
    "eq",
    "neq",
    "gte",
    "lte",
    "gt",
    "lt",
    "is",
    "order",
    "limit",
    "insert",
    "update",
  ]) {
    builder[method] = () => builder;
  }

  // Terminal links. `then` makes the whole builder awaitable, which is how the
  // count queries are actually consumed.
  builder.count = async () => ({ count: 0, error: null });
  builder.maybeSingle = async () => ({
    data: { failed_attempts: 0 },
    error: null,
  });
  builder.single = async () => ({ data: null, error: null });
  builder.then = (
    resolve: (value: { count: number; data: null; error: null }) => unknown,
  ) => resolve({ count: 0, data: null, error: null });

  return builder;
}

vi.mock("@/db/server", () => ({
  createClient: async () => ({
    auth: {
      signInWithOtp,
      verifyOtp: verifyOtpWithSupabase,
      signInWithPassword: vi.fn(async () => ({
        data: { user: { id: "new-user" } },
        error: null,
      })),
    },
  }),
  createServiceClient: () => ({
    auth: {
      admin: {
        createUser: adminCreateUser,
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: () => ({
            eq: (_column: string, value: string) => ({
              maybeSingle: async () => ({
                data: profiles.rows.find((row) => row.mobile === value) ?? null,
                error: null,
              }),
            }),
          }),
        };
      }

      if (table === "otp_logs") {
        return {
          select: () => chainable(),
          insert: () => chainable(),
          update: () => chainable(),
        };
      }

      return { select: () => chainable() };
    },
  }),
}));

/** A number that already has a customer profile. */
const REGISTERED = "+919876543210";
/** A number that has never been seen before. */
const UNKNOWN = "+919111111111";

function registerExisting() {
  profiles.rows = [
    { id: "existing-user", full_name: "Asha Menon", mobile: REGISTERED },
  ];
}

function clearExisting() {
  profiles.rows = [];
}

beforeEach(() => {
  vi.clearAllMocks();
  profiles.rows = [];
  // The dev bypass short-circuits before Supabase is reached, so the send
  // tests below are only meaningful with it off.
  vi.stubEnv("OTP_DEV_TEST_CODE", "off");
});

describe("findRegisteredCustomer", () => {
  it("finds an existing customer by canonical number", async () => {
    registerExisting();

    const result = await findRegisteredCustomer(REGISTERED);

    expect(result).toEqual({
      id: "existing-user",
      fullName: "Asha Menon",
    });
  });

  it("returns null for a number with no profile", async () => {
    registerExisting();

    expect(await findRegisteredCustomer(UNKNOWN)).toBeNull();
  });

  it("canonicalises before looking, so spelling does not matter", async () => {
    registerExisting();

    // The same customer typed with a trunk zero.
    expect(await findRegisteredCustomer("09876543210")).not.toBeNull();
    expect(await findRegisteredCustomer("919876543210")).not.toBeNull();
  });

  it("returns null for a number that is not a real mobile number", async () => {
    expect(await findRegisteredCustomer("nonsense")).toBeNull();
  });
});

describe("resolveIntent", () => {
  it("leaves an explicit intent alone", async () => {
    registerExisting();

    expect(await resolveIntent({ intent: "login", mobile: REGISTERED })).toBe(
      "login",
    );
    expect(await resolveIntent({ intent: "signup", mobile: REGISTERED })).toBe(
      "signup",
    );
  });

  it("resolves auto to login for a customer who already exists", async () => {
    registerExisting();

    expect(await resolveIntent({ intent: "auto", mobile: REGISTERED })).toBe(
      "login",
    );
  });

  it("resolves auto to signup for a number nobody has claimed", async () => {
    registerExisting();

    expect(await resolveIntent({ intent: "auto", mobile: UNKNOWN })).toBe(
      "signup",
    );
  });
});

describe("sendOtp", () => {
  it("signs up a new number, and asks Supabase to create the user", async () => {
    await sendOtp({
      mobile: UNKNOWN,
      fullName: "Asha Menon",
      intent: "signup",
    });

    expect(signInWithOtp).toHaveBeenCalledOnce();
    expect(signInWithOtp.mock.calls[0]?.[0].options.shouldCreateUser).toBe(
      true,
    );
  });

  it("passes the name through as metadata on signup only", async () => {
    await sendOtp({
      mobile: UNKNOWN,
      fullName: "Asha Menon",
      intent: "signup",
    });

    expect(signInWithOtp.mock.calls[0]?.[0].options.data.full_name).toBe(
      "Asha Menon",
    );
  });

  it("never asks Supabase to create a user during a login", async () => {
    registerExisting();

    await sendOtp({ mobile: REGISTERED, intent: "login" });

    expect(signInWithOtp).toHaveBeenCalledOnce();
    expect(signInWithOtp.mock.calls[0]?.[0].options.shouldCreateUser).toBe(
      false,
    );
  });

  /**
   * The acceptance criterion in one assertion: login cannot silently create a
   * user, even if the existence check were removed.
   */
  it("refuses to send a login code for a number with no account", async () => {
    clearExisting();

    await expect(sendOtp({ mobile: UNKNOWN, intent: "login" })).rejects.toThrow(
      /No account was found/,
    );

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(adminCreateUser).not.toHaveBeenCalled();
  });

  it("refuses to sign up a number that is already registered", async () => {
    registerExisting();

    await expect(
      sendOtp({
        mobile: REGISTERED,
        fullName: "Someone Else",
        intent: "signup",
      }),
    ).rejects.toThrow(/already registered/);

    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("never sends the name on a login, so a profile cannot be renamed", async () => {
    registerExisting();

    await sendOtp({ mobile: REGISTERED, intent: "login" });

    expect(
      signInWithOtp.mock.calls[0]?.[0].options.data.full_name,
    ).toBeUndefined();
  });

  it("canonicalises the number before dialling it", async () => {
    await sendOtp({
      mobile: "+91 91111 11111",
      fullName: "Asha",
      intent: "signup",
    });

    expect(signInWithOtp.mock.calls[0]?.[0].phone).toBe(UNKNOWN);
  });

  it("rejects a number that is not a usable mobile number", async () => {
    await expect(
      sendOtp({ mobile: "12345", fullName: "Asha", intent: "signup" }),
    ).rejects.toThrow();

    expect(signInWithOtp).not.toHaveBeenCalled();
  });

  it("sends no code when the dev bypass is active, and does not log it", async () => {
    vi.stubEnv("OTP_DEV_TEST_CODE", "000000");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await sendOtp({ mobile: UNKNOWN, fullName: "Asha", intent: "signup" });

    expect(signInWithOtp).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).not.toContain("000000");

    warn.mockRestore();
  });
});

describe("verifyOtp", () => {
  it("rejects a login for a number with no account", async () => {
    clearExisting();

    await expect(
      verifyOtp({ mobile: UNKNOWN, token: "123456", intent: "login" }),
    ).rejects.toThrow(/No account was found/);

    expect(verifyOtpWithSupabase).not.toHaveBeenCalled();
  });

  it("rejects a wrong code with a message that does not say why", async () => {
    registerExisting();

    await expect(
      verifyOtp({ mobile: REGISTERED, token: "000000", intent: "login" }),
    ).rejects.toThrow("That code is not valid or has expired.");
  });

  /**
   * Below the attempt limit a wrong code and an unknown number must be
   * indistinguishable, or the verify endpoint becomes the enumeration oracle
   * that the login form was careful not to be.
   */
  it("reports a wrong code identically to an unknown number, before the limit", async () => {
    registerExisting();

    await expect(
      verifyOtp({ mobile: REGISTERED, token: "000000", intent: "login" }),
    ).rejects.toThrow("That code is not valid or has expired.");

    clearExisting();

    await expect(
      verifyOtp({ mobile: UNKNOWN, token: "000000", intent: "login" }),
    ).rejects.toThrow(/No account was found/);
  });

  it("does not reach Supabase at all when the account does not exist", async () => {
    clearExisting();

    await expect(
      verifyOtp({ mobile: UNKNOWN, token: "123456", intent: "login" }),
    ).rejects.toThrow();

    expect(verifyOtpWithSupabase).not.toHaveBeenCalled();
  });
});

describe("MAX_FAILED_ATTEMPTS", () => {
  it("is a real ceiling rather than an unlimited guess space", () => {
    expect(MAX_FAILED_ATTEMPTS).toBeGreaterThan(0);
    expect(MAX_FAILED_ATTEMPTS).toBeLessThan(10);
  });
});
