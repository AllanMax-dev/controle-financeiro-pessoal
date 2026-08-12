import { describe, expect, it } from "vitest";

import {
  buildEqualSharePlan,
  buildInstallmentPlan,
  buildPersonTotal,
  buildSalaryOccurrencePlan,
  installmentDueDate,
  isDueOnOrBefore,
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

  it("marks installments as paid when their due date is on or before today", () => {
    const today = new Date("2026-08-12T00:00:00.000Z");

    expect(isDueOnOrBefore(new Date("2026-08-10T00:00:00.000Z"), today)).toBe(true);
    expect(isDueOnOrBefore(new Date("2026-08-12T00:00:00.000Z"), today)).toBe(true);
    expect(isDueOnOrBefore(new Date("2026-08-13T00:00:00.000Z"), today)).toBe(false);
  });

  it("supports fortnightly debt installments", () => {
    const firstDueDate = new Date("2026-08-10T00:00:00.000Z");
    const plan = buildInstallmentPlan("90.00", 3);

    expect(plan.map((_, index) => installmentDueDate(firstDueDate, index, "FORTNIGHTLY").toISOString().slice(0, 10))).toEqual(["2026-08-10", "2026-08-24", "2026-09-07"]);
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
