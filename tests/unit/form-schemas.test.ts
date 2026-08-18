import { describe, expect, it } from "vitest";

import {
  dateInputSchema,
  identifierSchema,
  moneyInputSchema,
  monthInputSchema,
  positiveMoneyInputSchema,
  versionSchema,
} from "../../src/modules/shared/application/form-schemas";

describe("financial form schemas", () => {
  it("validates identifiers, real dates, months and versions", () => {
    expect(identifierSchema.safeParse("550e8400-e29b-41d4-a716-446655440000").success).toBe(true);
    expect(identifierSchema.safeParse("not-an-id").success).toBe(false);
    expect(dateInputSchema.safeParse("2026-02-31").success).toBe(false);
    expect(dateInputSchema.safeParse("2026-02-28").success).toBe(true);
    expect(monthInputSchema.safeParse("2026-13").success).toBe(false);
    expect(versionSchema.safeParse("0").success).toBe(false);
    expect(versionSchema.safeParse("2").success).toBe(true);
  });

  it("allows zero only in the non-positive money schema", () => {
    expect(moneyInputSchema.safeParse("0,00").success).toBe(true);
    expect(positiveMoneyInputSchema.safeParse("0,00").success).toBe(false);
    expect(positiveMoneyInputSchema.safeParse("0,01").success).toBe(true);
    expect(positiveMoneyInputSchema.safeParse("NaN").success).toBe(false);
  });
});
