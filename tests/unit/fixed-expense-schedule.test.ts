import { describe, expect, it } from "vitest";

import {
  calculateFixedExpenseTotals,
  fixedExpenseDueDate,
  monthStart,
} from "../../src/modules/fixed-expenses/domain/fixed-expense-schedule";

describe("fixed expense schedule", () => {
  it("uses the last available day in shorter months", () => {
    expect(
      fixedExpenseDueDate(new Date("2028-02-01T00:00:00.000Z"), 31).toISOString(),
    ).toBe("2028-02-29T00:00:00.000Z");
    expect(monthStart(new Date("2026-08-26T15:00:00.000Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("separates paid values from scheduled pending values", () => {
    const totals = calculateFixedExpenseTotals([
      { amount: "1500.00", payment: { amount: "1500.00", status: "SETTLED" } },
      { amount: "700.00", payment: { amount: "745.50", status: "SETTLED" } },
      { amount: "120.00", payment: null },
      { amount: "80.00", payment: { amount: "80.00", status: "CANCELED" } },
    ]);

    expect(totals.expected.toFixed(2)).toBe("2400.00");
    expect(totals.paid.toFixed(2)).toBe("2245.50");
    expect(totals.pending.toFixed(2)).toBe("200.00");
    expect(totals.paidCount).toBe(2);
    expect(totals.pendingCount).toBe(2);
  });
});
