import { describe, expect, it } from "vitest";

import { assertCreditCardConfigurationChange } from "../../src/modules/finance/application/credit-card-reconciliation";

import {
  buildEqualSharePlan,
  buildInstallmentPlan,
  buildPersonTotal,
  buildSalaryOccurrencePlan,
  clampDayInMonth,
  creditCardFirstDueDate,
  creditCardInstallmentIsOverdue,
  installmentDueDate,
  monthlyDueDate,
  monthBounds,
  resolveInvoiceMonth,
  sumPersonTotals,
} from "../../src/modules/finance/domain/finance-calculations";

describe("finance calculations", () => {
  it("creates stable month bounds", () => {
    const bounds = monthBounds("2026-08");

    expect(bounds.start.toISOString()).toBe("2026-08-01T00:00:00.000Z");
    expect(bounds.end.toISOString()).toBe("2026-09-01T00:00:00.000Z");
  });

  it("splits debt installments without losing cents", () => {
    const firstDueDate = new Date("2026-08-10T00:00:00.000Z");
    const plan = buildInstallmentPlan("100.00", 3);

    expect(plan.map((installment) => installment.amount.toFixed(2))).toEqual(["33.34", "33.33", "33.33"]);
    expect(plan.map((installment, index) => installmentDueDate(firstDueDate, index, "MONTHLY").toISOString().slice(0, 10))).toEqual(["2026-08-10", "2026-09-10", "2026-10-10"]);
  });

  it("splits shared values equally between people without losing cents", () => {
    const shares = buildEqualSharePlan("100.00", ["allan", "mayara"]);

    expect(shares).toHaveLength(2);
    expect(shares.map((share) => share.personEditorId)).toEqual(["allan", "mayara"]);
    expect(shares.map((share) => share.amount.toFixed(2))).toEqual(["50.00", "50.00"]);
  });

  it("splits larger installments without losing cents", () => {
    const plan = buildInstallmentPlan("999.99", 7);

    expect(plan.map((installment) => installment.amount.toFixed(2))).toEqual(["142.86", "142.86", "142.86", "142.86", "142.85", "142.85", "142.85"]);
    expect(plan.reduce((total, installment) => total.plus(installment.amount), plan[0]!.amount.minus(plan[0]!.amount)).toFixed(2)).toBe("999.99");
  });

  it("supports fortnightly debt installments", () => {
    const firstDueDate = new Date("2026-08-10T00:00:00.000Z");
    const plan = buildInstallmentPlan("90.00", 3);

    expect(plan.map((_, index) => installmentDueDate(firstDueDate, index, "FORTNIGHTLY").toISOString().slice(0, 10))).toEqual(["2026-08-15", "2026-08-30", "2026-09-15"]);
  });

  it("starts fortnightly debt installments on the next 15/30 slot", () => {
    const firstDueDate = new Date("2026-08-20T00:00:00.000Z");

    expect([0, 1, 2].map((index) => installmentDueDate(firstDueDate, index, "FORTNIGHTLY").toISOString().slice(0, 10))).toEqual(["2026-08-30", "2026-09-15", "2026-09-30"]);
  });

  it("clamps the second fortnightly debt slot when the month has no day 30", () => {
    const firstDueDate = new Date("2026-02-20T00:00:00.000Z");

    expect([0, 1, 2].map((index) => installmentDueDate(firstDueDate, index, "FORTNIGHTLY").toISOString().slice(0, 10))).toEqual(["2026-02-28", "2026-03-15", "2026-03-30"]);
  });

  it("builds credit card installment due dates from the first installment date", () => {
    const firstDueDate = new Date("2026-07-10T00:00:00.000Z");

    expect([0, 1, 2].map((index) => monthlyDueDate(firstDueDate, index).toISOString().slice(0, 10))).toEqual(["2026-07-10", "2026-08-10", "2026-09-10"]);
  });

  it("presents overdue credit card installments without marking them as paid", () => {
    const firstDueDate = new Date("2026-07-10T00:00:00.000Z");
    const today = new Date("2026-08-12T00:00:00.000Z");

    expect([1, 2, 3].map((number) => creditCardInstallmentIsOverdue(firstDueDate, number, today, "OPEN"))).toEqual([true, true, false]);
    expect(creditCardInstallmentIsOverdue(firstDueDate, 1, today, "PAID")).toBe(false);
  });

  it("clamps monthly due dates when the target month is shorter", () => {
    const firstDueDate = new Date("2026-01-31T00:00:00.000Z");

    expect([0, 1, 2].map((index) => monthlyDueDate(firstDueDate, index).toISOString().slice(0, 10))).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });

  it("keeps monthly salary as one monthly occurrence", () => {
    const plan = buildSalaryOccurrencePlan("4000.00", "MONTHLY", new Date("2026-08-01T00:00:00.000Z"), 15);

    expect(plan.map((occurrence) => occurrence.amount.toFixed(2))).toEqual(["4000.00"]);
    expect(plan.map((occurrence) => occurrence.dueDate.toISOString().slice(0, 10))).toEqual(["2026-08-15"]);
  });

  it("splits fortnightly salary within the same month without duplicating the monthly amount", () => {
    const plan = buildSalaryOccurrencePlan("4000.00", "FORTNIGHTLY", new Date("2026-08-01T00:00:00.000Z"), 15);

    expect(plan.map((occurrence) => occurrence.amount.toFixed(2))).toEqual(["2000.00", "2000.00"]);
    expect(plan.map((occurrence) => occurrence.dueDate.toISOString().slice(0, 10))).toEqual(["2026-08-15", "2026-08-31"]);
  });

  it("resolves credit card invoice month from the closing day", () => {
    expect(resolveInvoiceMonth(new Date("2026-08-03T00:00:00.000Z"), 5).toISOString().slice(0, 10)).toBe("2026-08-01");
    expect(resolveInvoiceMonth(new Date("2026-08-07T00:00:00.000Z"), 5).toISOString().slice(0, 10)).toBe("2026-09-01");
  });

  it("derives one invoice due date from the invoice month and card due day", () => {
    expect(clampDayInMonth(new Date("2026-08-01T00:00:00.000Z"), 10).toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(clampDayInMonth(new Date("2026-02-01T00:00:00.000Z"), 31).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("calculates the first credit card due date from purchase date, closing day and due day", () => {
    expect(creditCardFirstDueDate(new Date("2026-08-03T00:00:00.000Z"), 5, 10).toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(creditCardFirstDueDate(new Date("2026-08-07T00:00:00.000Z"), 5, 10).toISOString().slice(0, 10)).toBe("2026-09-10");
    expect(creditCardFirstDueDate(new Date("2026-08-12T00:00:00.000Z"), 20, 10).toISOString().slice(0, 10)).toBe("2026-09-10");
  });

  it("freezes card owner and schedule after financial history exists", () => {
    const current = { closingDay: 5, dueDay: 10, personEditorId: "allan" };

    expect(() => assertCreditCardConfigurationChange(current, { ...current, personEditorId: "mayara" }, true)).toThrow("titular");
    expect(() => assertCreditCardConfigurationChange(current, { ...current, dueDay: 15 }, true)).toThrow("fechamento e vencimento");
    expect(() => assertCreditCardConfigurationChange(current, { ...current, dueDay: 15 }, false)).not.toThrow();
  });

  it("aggregates personal totals into the couple view", () => {
    const allan = buildPersonTotal({
      available: "1200",
      expenses: "400",
      income: "1800",
      investments: "300",
      paid: "200",
      pending: "100",
    });
    const mayara = buildPersonTotal({
      available: "800",
      expenses: "300",
      income: "1500",
      investments: "200",
      paid: "100",
      pending: "50",
    });

    const casal = sumPersonTotals([allan, mayara]);

    expect(casal.income.toFixed(2)).toBe("3300.00");
    expect(casal.expenses.toFixed(2)).toBe("700.00");
    expect(casal.available.toFixed(2)).toBe("2000.00");
    expect(casal.net.toFixed(2)).toBe("2600.00");
    expect(casal.wealth.toFixed(2)).toBe("2500.00");
  });
});
