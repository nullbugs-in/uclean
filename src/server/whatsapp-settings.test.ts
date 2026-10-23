import { describe, expect, it } from "vitest";

import type { DbClient, Json, WhatsAppSettings } from "@/db/types";

import {
  getWhatsAppSettings,
  recordWhatsAppTestResult,
  updateWhatsAppSettings,
  WhatsAppSettingsError,
} from "./whatsapp-settings";

/**
 * `whatsapp_settings` and `audit_logs`, faked.
 *
 * The one-row-table clone of `store-settings.test.ts`, because this module is
 * its double: a singleton write with an audit trail. The behaviours worth
 * pinning are that the row is patched rather than replaced, that the audit
 * entry carries a real before and after, and that a settings save never
 * rewrites the test result columns the test action owns.
 */

type AuditRow = {
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Json | null;
  after: Json | null;
};

type Builder = {
  select: () => Builder;
  update: (values: Partial<WhatsAppSettings>) => Builder;
  eq: (column: string, value: unknown) => Builder;
  maybeSingle: () => Promise<{
    data: WhatsAppSettings | null;
    error: { message: string } | null;
  }>;
  insert: (values: AuditRow) => Promise<{
    data: null;
    error: { message: string } | null;
  }>;
};

function makeSettings(
  overrides: Partial<WhatsAppSettings> = {},
): WhatsAppSettings {
  return {
    id: true,
    enabled: false,
    template_mapping: {
      order_confirmed: { name: "uclean_pickup_confirmed", language: "en_US" },
    },
    last_test_ok: null,
    last_test_at: null,
    last_test_error: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeClient(initial: WhatsAppSettings | null) {
  let row = initial ? { ...initial } : null;
  const audits: AuditRow[] = [];
  // The bare patches, so a test can assert a writer touched exactly its own
  // fields without depending on the read-modify-write dance.
  const patches: Partial<WhatsAppSettings>[] = [];

  function table(name: string): Builder {
    let operation: "select" | "update" = "select";
    let patch: Partial<WhatsAppSettings> = {};

    const api: Builder = {
      select: () => api,
      update: (values) => {
        operation = "update";
        patch = values;
        return api;
      },
      eq: () => {
        if (operation === "update" && row) {
          row = { ...row, ...patch };
          patches.push(patch);
        }
        return api;
      },
      async maybeSingle() {
        if (operation === "update") {
          if (!row) {
            return { data: null, error: null };
          }
          row = { ...row, ...patch };
          return { data: row, error: null };
        }
        return { data: row, error: null };
      },
      async insert(values) {
        if (name === "audit_logs") audits.push(values);
        return { data: null, error: null };
      },
    };

    return api;
  }

  return {
    client: { from: (name: string) => table(name) } as unknown as DbClient,
    audits,
    getRow: () => row,
    patches,
  };
}

const MAPPING = {
  order_confirmed: { name: "uclean_pickup_confirmed_v2", language: "en" },
};

const UPDATE = {
  enabled: true,
  templateMapping: MAPPING,
};

describe("updateWhatsAppSettings", () => {
  it("writes the switch and the mapping, and returns the saved row", async () => {
    const { client, getRow } = fakeClient(makeSettings());

    const saved = await updateWhatsAppSettings(client, "admin-1", UPDATE);

    expect(saved.enabled).toBe(true);
    expect(saved.template_mapping).toEqual(MAPPING);
    expect(getRow()?.enabled).toBe(true);
  });

  it("records who changed what, with a real before and after", async () => {
    const { client, audits } = fakeClient(makeSettings({ enabled: false }));

    await updateWhatsAppSettings(client, "admin-1", UPDATE);

    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      actor_id: "admin-1",
      action: "whatsapp_settings.updated",
      entity: "whatsapp_settings",
      entity_id: "true",
    });
    expect(audits[0]?.before).toMatchObject({ enabled: false });
    expect(audits[0]?.after).toMatchObject({
      enabled: true,
      template_mapping: MAPPING,
    });
  });

  it("patches exactly its own fields, leaving the test result alone", async () => {
    // The test action owns last_test_*; a settings save must not blank a
    // passing test result just because the mapping changed.
    const { client, patches } = fakeClient(
      makeSettings({
        last_test_ok: true,
        last_test_at: "2026-03-01T00:00:00Z",
      }),
    );

    await updateWhatsAppSettings(client, "admin-1", UPDATE);

    // The switch and the mapping, and none of the test columns.
    expect(patches[0]).toEqual({
      enabled: true,
      template_mapping: MAPPING,
    });
  });

  it("refuses to write when the settings row is missing", async () => {
    const { client, audits } = fakeClient(null);

    await expect(
      updateWhatsAppSettings(client, "admin-1", UPDATE),
    ).rejects.toBeInstanceOf(WhatsAppSettingsError);

    // No dangling audit row for a change that never happened.
    expect(audits).toHaveLength(0);
  });
});

describe("getWhatsAppSettings", () => {
  it("returns the singleton, or null before the migration ran", async () => {
    const present = fakeClient(makeSettings({ enabled: true }));
    const readBack = await getWhatsAppSettings(present.client);
    expect(readBack).toMatchObject({ id: true, enabled: true });

    const missing = fakeClient(null);
    expect(await getWhatsAppSettings(missing.client)).toBeNull();
  });
});

describe("recordWhatsAppTestResult", () => {
  it("records a passing test and clears any previous error", async () => {
    const { client, getRow, patches } = fakeClient(
      makeSettings({ last_test_ok: false, last_test_error: "stale failure" }),
    );

    await recordWhatsAppTestResult(client, { ok: true });

    expect(getRow()?.last_test_ok).toBe(true);
    expect(getRow()?.last_test_error).toBeNull();
    expect(getRow()?.last_test_at).toBeTruthy();
    // Only the test columns; the switch and the mapping are untouched.
    expect(Object.keys(patches[0] ?? {}).sort()).toEqual([
      "last_test_at",
      "last_test_error",
      "last_test_ok",
    ]);
  });

  it("records a failed test with Meta's error text", async () => {
    const { client, getRow } = fakeClient(makeSettings());

    await recordWhatsAppTestResult(client, {
      ok: false,
      error: "Template param set invalid",
    });

    expect(getRow()?.last_test_ok).toBe(false);
    expect(getRow()?.last_test_error).toBe("Template param set invalid");
  });
});
