import { describe, expect, it } from "vitest";

import {
  dateInputSchema,
  monthInputSchema,
} from "../../src/modules/shared/application/form-schemas";

describe("form date schemas", () => {
  it("accepts real calendar dates", () => {
    expect(dateInputSchema.parse("2028-02-29").toISOString()).toBe(
      "2028-02-29T00:00:00.000Z",
    );
  });

  it("rejects dates normalized by the JavaScript Date constructor", () => {
    expect(dateInputSchema.safeParse("2026-02-31").success).toBe(false);
    expect(dateInputSchema.safeParse("2026-04-31").success).toBe(false);
  });

  it("accepts only valid calendar months", () => {
    expect(monthInputSchema.parse("2026-12").toISOString()).toBe(
      "2026-12-01T00:00:00.000Z",
    );
    expect(monthInputSchema.safeParse("2026-13").success).toBe(false);
  });
});
