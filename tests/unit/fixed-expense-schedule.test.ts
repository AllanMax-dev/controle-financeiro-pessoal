import { describe, expect, it } from "vitest";

import {
  calendarDateInTimeZone,
  calculateFixedExpenseTotals,
  fixedExpenseDueDate,
  fixedExpenseOccurrencesThrough,
  monthStart,
} from "../../src/modules/fixed-expenses/domain/fixed-expense-schedule";

describe("fixed expense schedule", () => {
  it("uses the workspace calendar day near the UTC date boundary", () => {
    expect(
      calendarDateInTimeZone(
        new Date("2026-08-07T01:30:00.000Z"),
        "America/Sao_Paulo",
      ).toISOString(),
    ).toBe("2026-08-06T00:00:00.000Z");
  });

  it("uses the last available day in shorter months", () => {
    expect(
      fixedExpenseDueDate(new Date("2028-02-01T00:00:00.000Z"), 31).toISOString(),
    ).toBe("2028-02-29T00:00:00.000Z");
    expect(monthStart(new Date("2026-08-26T15:00:00.000Z")).toISOString()).toBe(
      "2026-08-01T00:00:00.000Z",
    );
  });

  it("creates one due occurrence for every month since the recurrence started", () => {
    const occurrences = fixedExpenseOccurrencesThrough(
      new Date("2026-06-01T00:00:00.000Z"),
      15,
      new Date("2026-08-15T12:00:00.000Z"),
    );

    expect(
      occurrences.map(({ dueDate, month }) => ({
        dueDate: dueDate.toISOString(),
        month: month.toISOString(),
      })),
    ).toEqual([
      {
        dueDate: "2026-06-15T00:00:00.000Z",
        month: "2026-06-01T00:00:00.000Z",
      },
      {
        dueDate: "2026-07-15T00:00:00.000Z",
        month: "2026-07-01T00:00:00.000Z",
      },
      {
        dueDate: "2026-08-15T00:00:00.000Z",
        month: "2026-08-01T00:00:00.000Z",
      },
    ]);
  });

  it("does not create the current occurrence before its due day", () => {
    const occurrences = fixedExpenseOccurrencesThrough(
      new Date("2026-07-01T00:00:00.000Z"),
      20,
      new Date("2026-08-06T12:00:00.000Z"),
    );

    expect(occurrences.map(({ month }) => month.toISOString())).toEqual([
      "2026-07-01T00:00:00.000Z",
    ]);
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
