import { describe, expect, it } from "vitest";

import {
  addCalendarMonths,
  createDebtInstallmentPlan,
  defaultFirstDueDate,
  inferPaidInstallmentCount,
} from "../../src/modules/debts/domain/installment-plan";
import { sumMoney } from "../../src/modules/shared/domain/money";

describe("debt installment plan", () => {
  it("keeps calendar days valid across shorter months", () => {
    expect(addCalendarMonths(new Date("2026-01-31T00:00:00.000Z"), 1).toISOString()).toBe(
      "2026-02-28T00:00:00.000Z",
    );
    expect(defaultFirstDueDate(new Date("2026-07-05T00:00:00.000Z")).toISOString()).toBe(
      "2026-08-05T00:00:00.000Z",
    );
  });

  it("infers installments whose due dates have already arrived", () => {
    const paid = inferPaidInstallmentCount(
      new Date("2026-05-05T00:00:00.000Z"),
      10,
      new Date("2026-08-05T12:00:00.000Z"),
    );

    expect(paid).toBe(4);
  });

  it("creates an exact individual and consolidated split", () => {
    const plan = createDebtInstallmentPlan({
      firstDueDate: new Date("2026-05-05T00:00:00.000Z"),
      installmentCount: 10,
      paidInstallments: 4,
      shares: [
        { amount: "900.00", editorId: "allan" },
        { amount: "600.00", editorId: "mayara" },
      ],
      totalAmount: "1500.00",
    });

    expect(plan).toHaveLength(10);
    expect(plan.filter(({ status }) => status === "PAID")).toHaveLength(4);
    expect(sumMoney(plan.map(({ amount }) => amount)).toFixed(2)).toBe("1500.00");
    expect(
      sumMoney(
        plan.flatMap(({ shares }) =>
          shares.filter(({ editorId }) => editorId === "allan").map(({ amount }) => amount),
        ),
      ).toFixed(2),
    ).toBe("900.00");
    expect(
      sumMoney(
        plan.flatMap(({ shares }) =>
          shares.filter(({ editorId }) => editorId === "mayara").map(({ amount }) => amount),
        ),
      ).toFixed(2),
    ).toBe("600.00");
  });

  it("rejects a split that differs from the purchase total", () => {
    expect(() =>
      createDebtInstallmentPlan({
        firstDueDate: new Date("2026-08-05T00:00:00.000Z"),
        installmentCount: 2,
        paidInstallments: 0,
        shares: [
          { amount: "60.00", editorId: "allan" },
          { amount: "30.00", editorId: "mayara" },
        ],
        totalAmount: "100.00",
      }),
    ).toThrow("igual ao valor total");
  });
});
