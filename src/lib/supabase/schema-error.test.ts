import { describe, expect, it } from "vitest";

import { isSchemaOutOfDate } from "./schema-error";

describe("isSchemaOutOfDate", () => {
  it("recognises the Postgres codes", () => {
    expect(isSchemaOutOfDate({ code: "42703" })).toBe(true);
    expect(isSchemaOutOfDate({ code: "42P01" })).toBe(true);
  });

  it("recognises PostgREST's cached-schema codes", () => {
    expect(isSchemaOutOfDate({ code: "PGRST204" })).toBe(true);
    expect(isSchemaOutOfDate({ code: "PGRST205" })).toBe(true);
  });

  it("recognises the message once the code has been lost", () => {
    // selectInBatches re-throws as a plain Error, so by the time a page sees
    // it the code is gone and only the sentence is left.
    expect(
      isSchemaOutOfDate(
        new Error(
          "Could not read attendance for 2026-09-01 to 2026-09-09: column attendance_days.approved_by does not exist",
        ),
      ),
    ).toBe(true);

    expect(
      isSchemaOutOfDate(
        new Error("Could not find the 'language' column of 'profiles' in the schema cache"),
      ),
    ).toBe(true);

    expect(isSchemaOutOfDate(new Error('relation "public.gate_entries" does not exist'))).toBe(
      true,
    );
  });

  it("does not claim an ordinary failure is a missing migration", () => {
    // The cost of a false positive is telling the office to run a migration
    // that will not fix anything, while the real fault goes unreported.
    expect(isSchemaOutOfDate(new Error("fetch failed"))).toBe(false);
    expect(isSchemaOutOfDate(new Error("JWT expired"))).toBe(false);
    expect(isSchemaOutOfDate({ code: "23505" })).toBe(false);
    expect(isSchemaOutOfDate({ code: "PGRST301" })).toBe(false);
  });

  it("is false for nothing at all", () => {
    expect(isSchemaOutOfDate(null)).toBe(false);
    expect(isSchemaOutOfDate(undefined)).toBe(false);
  });
});
