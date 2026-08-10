import { describe, expect, it } from "vitest";

import {
  calculateAccountBalances,
  calculateConsolidatedBalance,
  calculatePeriodResult,
} from "../../src/modules/transactions/domain/financial-summary";

describe("financial summary", () => {
  it("applies only settled transactions to account balances", () => {
    const balances = calculateAccountBalances(
      [{ id: "checking", initialBalance: "100.00" }],
      [
        { accountId: "checking", amount: "50.00", status: "SETTLED", type: "INCOME" },
        { accountId: "checking", amount: "20.00", status: "SETTLED", type: "EXPENSE" },
        { accountId: "checking", amount: "999.00", status: "PENDING", type: "INCOME" },
      ],
      [],
    );

    expect(balances.get("checking")?.toFixed(2)).toBe("130.00");
  });

  it("keeps imported historical expenses out of the current account balance", () => {
    const balances = calculateAccountBalances(
      [{ id: "checking", initialBalance: "1000.00" }],
      [
        {
          accountId: "checking",
          affectsBalance: false,
          amount: "600.00",
          status: "SETTLED",
          type: "EXPENSE",
        },
        {
          accountId: "checking",
          affectsBalance: true,
          amount: "150.00",
          status: "SETTLED",
          type: "EXPENSE",
        },
      ],
      [],
    );

    expect(balances.get("checking")?.toFixed(2)).toBe("850.00");
  });

  it("moves money between accounts without changing the consolidated balance", () => {
    const balances = calculateAccountBalances(
      [
        { id: "source", initialBalance: "200.00" },
        { id: "destination", initialBalance: "50.00" },
      ],
      [],
      [
        {
          amount: "75.00",
          destinationAccountId: "destination",
          sourceAccountId: "source",
          status: "SETTLED",
        },
      ],
    );

    expect(balances.get("source")?.toFixed(2)).toBe("125.00");
    expect(balances.get("destination")?.toFixed(2)).toBe("125.00");
    expect(calculateConsolidatedBalance(balances).toFixed(2)).toBe("250.00");
  });

  it("applies balance adjustments without changing the operational result", () => {
    const transactions = [
      { accountId: "checking", amount: "100.00", status: "SETTLED" as const, type: "INCOME" as const },
      { accountId: "checking", amount: "25.00", status: "SETTLED" as const, type: "EXPENSE" as const },
    ];
    const balances = calculateAccountBalances(
      [{ id: "checking", initialBalance: "100.00" }],
      transactions,
      [],
      [{ accountId: "checking", difference: "-30.00" }],
    );
    const result = calculatePeriodResult(transactions);

    expect(balances.get("checking")?.toFixed(2)).toBe("145.00");
    expect(result.income.toFixed(2)).toBe("100.00");
    expect(result.expense.toFixed(2)).toBe("25.00");
    expect(result.result.toFixed(2)).toBe("75.00");
  });

  it("applies positive, negative and multiple adjustments alongside later movements", () => {
    const balances = calculateAccountBalances(
      [
        { id: "checking", initialBalance: "100.00" },
        { id: "investment", initialBalance: "1000.00" },
      ],
      [
        { accountId: "checking", amount: "100.00", status: "SETTLED", type: "INCOME" },
        { accountId: "checking", amount: "25.00", status: "SETTLED", type: "EXPENSE" },
      ],
      [
        {
          amount: "50.00",
          destinationAccountId: "investment",
          sourceAccountId: "checking",
          status: "SETTLED",
        },
      ],
      [
        { accountId: "checking", difference: "200.00" },
        { accountId: "checking", difference: "-25.00" },
        { accountId: "investment", difference: "300.00" },
      ],
    );

    expect(balances.get("checking")?.toFixed(2)).toBe("300.00");
    expect(balances.get("investment")?.toFixed(2)).toBe("1350.00");
    expect(calculateConsolidatedBalance(balances).toFixed(2)).toBe("1650.00");
  });
  it("excludes pending and canceled entries from the realized result", () => {
    const result = calculatePeriodResult([
      {
        accountId: "a",
        amount: "250.00",
        salaryId: "salary",
        status: "SETTLED",
        type: "INCOME",
      },
      { accountId: "a", amount: "50.00", salaryId: null, status: "SETTLED", type: "INCOME" },
      { accountId: "a", amount: "100.00", status: "SETTLED", type: "EXPENSE" },
      { accountId: "a", amount: "80.00", status: "PENDING", type: "EXPENSE" },
      { accountId: "a", amount: "40.00", status: "CANCELED", type: "INCOME" },
    ]);

    expect(result.income.toFixed(2)).toBe("300.00");
    expect(result.expense.toFixed(2)).toBe("100.00");
    expect(result.result.toFixed(2)).toBe("200.00");
    expect(result.salaryIncome.toFixed(2)).toBe("250.00");
    expect(result.otherIncome.toFixed(2)).toBe("50.00");
    expect(result.salaryIncome.plus(result.otherIncome).equals(result.income)).toBe(true);
  });
});
