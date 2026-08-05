import { describe, expect, it } from "vitest";

import {
  buildBudgetComparison,
  buildMonthlyEvolution,
  calculateProjectedBalance,
  createTrailingMonthBuckets,
} from "../../src/modules/dashboard/domain/dashboard-analytics";

describe("dashboard analytics", () => {
  it("builds monthly evolution from settled transactions only", () => {
    const buckets = createTrailingMonthBuckets(3, new Date("2026-08-15T12:00:00.000Z"));
    const evolution = buildMonthlyEvolution(
      [
        {
          amount: "1000.00",
          category: null,
          competenceDate: new Date("2026-07-10T00:00:00.000Z"),
          status: "SETTLED",
          type: "INCOME",
        },
        {
          amount: "250.25",
          category: null,
          competenceDate: new Date("2026-07-11T00:00:00.000Z"),
          status: "SETTLED",
          type: "EXPENSE",
        },
        {
          amount: "999.00",
          category: null,
          competenceDate: new Date("2026-07-12T00:00:00.000Z"),
          status: "PENDING",
          type: "EXPENSE",
        },
        {
          amount: "100.00",
          category: null,
          competenceDate: new Date("2026-08-01T00:00:00.000Z"),
          status: "CANCELED",
          type: "INCOME",
        },
      ],
      buckets,
    );

    expect(evolution.map(({ key }) => key)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(evolution[1]).toMatchObject({
      expense: 250.25,
      income: 1000,
      result: 749.75,
    });
    expect(evolution[2]).toMatchObject({ expense: 0, income: 0, result: 0 });
  });

  it("compares planned budget against realized expenses by category", () => {
    const food = { color: "#256b4b", id: "food", name: "Mercado" };
    const comparison = buildBudgetComparison(
      [{ amount: "500.00", category: food }],
      [
        {
          amount: "125.10",
          category: food,
          competenceDate: new Date("2026-08-10T00:00:00.000Z"),
          status: "SETTLED",
          type: "EXPENSE",
        },
        {
          amount: "80.00",
          category: null,
          competenceDate: new Date("2026-08-12T00:00:00.000Z"),
          status: "SETTLED",
          type: "EXPENSE",
        },
        {
          amount: "60.00",
          category: food,
          competenceDate: new Date("2026-08-13T00:00:00.000Z"),
          status: "PENDING",
          type: "EXPENSE",
        },
      ],
    );

    expect(comparison.totalPlanned.toFixed(2)).toBe("500.00");
    expect(comparison.totalRealized.toFixed(2)).toBe("205.10");
    expect(comparison.remaining.toFixed(2)).toBe("294.90");
    expect(comparison.categories).toEqual([
      {
        color: "#256b4b",
        id: "food",
        name: "Mercado",
        planned: 500,
        realized: 125.1,
        remaining: 374.9,
      },
      {
        color: "#9aa59d",
        id: "uncategorized",
        name: "Sem categoria",
        planned: 0,
        realized: 80,
        remaining: -80,
      },
    ]);
  });

  it("projects balance from pending income and expense without floating point drift", () => {
    expect(calculateProjectedBalance("1000.00", "100.55", "30.10").toFixed(2)).toBe("1070.45");
  });
});
