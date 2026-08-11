import { describe, expect, it } from "vitest";

import {
  buildBudgetComparison,
  buildMonthlyEvolution,
  calculatePendingTransferAvailableDelta,
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
        id: "EXPENSE:mercado",
        name: "Mercado",
        planned: 500,
        realized: 125.1,
        remaining: 374.9,
      },
      {
        color: "#9aa59d",
        id: "EXPENSE:sem categoria",
        name: "Sem categoria",
        planned: 0,
        realized: 80,
        remaining: -80,
      },
    ]);
  });

  it("ignores investment account transactions in operational analytics", () => {
    const buckets = createTrailingMonthBuckets(1, new Date("2026-08-15T12:00:00.000Z"));
    const investmentCategory = { color: "#7c3aed", id: "investment", name: "Aporte" };
    const operationalCategory = { color: "#256b4b", id: "food", name: "Mercado" };
    const transactions = [
      {
        account: { type: "INVESTMENT" },
        amount: "900.00",
        category: investmentCategory,
        competenceDate: new Date("2026-08-02T00:00:00.000Z"),
        status: "SETTLED" as const,
        type: "EXPENSE" as const,
      },
      {
        account: { type: "CHECKING" },
        amount: "120.00",
        category: operationalCategory,
        competenceDate: new Date("2026-08-03T00:00:00.000Z"),
        status: "SETTLED" as const,
        type: "EXPENSE" as const,
      },
    ];

    expect(buildMonthlyEvolution(transactions, buckets)[0]).toMatchObject({
      expense: 120,
      income: 0,
      result: -120,
    });
    expect(buildBudgetComparison([], transactions).totalRealized.toFixed(2)).toBe("120.00");
    expect(buildBudgetComparison([], transactions).categories.map(({ id }) => id)).toEqual(["EXPENSE:mercado"]);
  });

  it("calculates pending transfer effects on available money without double counting", () => {
    const delta = calculatePendingTransferAvailableDelta([
      {
        amount: "200.00",
        destinationAccount: { type: "INVESTMENT" },
        sourceAccount: { type: "CHECKING" },
        status: "PENDING",
      },
      {
        amount: "75.00",
        destinationAccount: { type: "CHECKING" },
        sourceAccount: { type: "INVESTMENT" },
        status: "PENDING",
      },
      {
        amount: "999.00",
        destinationAccount: { type: "SAVINGS" },
        sourceAccount: { type: "CHECKING" },
        status: "PENDING",
      },
      {
        amount: "888.00",
        destinationAccount: { type: "INVESTMENT" },
        sourceAccount: { type: "INVESTMENT" },
        status: "PENDING",
      },
      {
        amount: "50.00",
        destinationAccount: { type: "INVESTMENT" },
        sourceAccount: { type: "CHECKING" },
        status: "SETTLED",
      },
    ]);

    expect(delta.toFixed(2)).toBe("-125.00");
  });

  it("keeps operational transfers between couple contexts neutral in the consolidated view", () => {
    const delta = calculatePendingTransferAvailableDelta(
      [
        {
          amount: "300.00",
          destinationAccount: { type: "CHECKING" },
          destinationContextId: "mayara-personal",
          sourceAccount: { type: "CHECKING" },
          sourceContextId: "allan-personal",
          status: "PENDING",
        },
        {
          amount: "120.00",
          destinationAccount: { type: "INVESTMENT" },
          destinationContextId: "mayara-personal",
          sourceAccount: { type: "CHECKING" },
          sourceContextId: "allan-personal",
          status: "PENDING",
        },
        {
          amount: "40.00",
          destinationAccount: { type: "CHECKING" },
          destinationContextId: "allan-personal",
          sourceAccount: { type: "CHECKING" },
          sourceContextId: "external-context",
          status: "PENDING",
        },
      ],
      ["allan-personal", "mayara-personal", "legacy-couple"],
    );

    expect(delta.toFixed(2)).toBe("-80.00");
  });

  it("projects balance from pendencies and transfer delta without floating point drift", () => {
    expect(calculateProjectedBalance("1000.00", "100.55", "30.10", "-125.00").toFixed(2)).toBe("945.45");
  });
});
