import { describe, expect, it } from "vitest";

import {
  budgetUsageLabel,
  calculateBudgetUsage,
} from "../../src/modules/planning/domain/budget-usage";

describe("budget usage", () => {
  it("calculates the available amount and regular progress", () => {
    const usage = calculateBudgetUsage("1000.00", "420.00");

    expect(usage.remaining.toFixed(2)).toBe("580.00");
    expect(usage.percentage?.toFixed(0)).toBe("42");
    expect(usage.progress).toBe(42);
    expect(usage.status).toBe("on-track");
  });

  it("keeps the displayed progress capped while reporting an exceeded limit", () => {
    const usage = calculateBudgetUsage("500.00", "625.00");

    expect(usage.remaining.toFixed(2)).toBe("-125.00");
    expect(usage.percentage?.toFixed(0)).toBe("125");
    expect(usage.progress).toBe(100);
    expect(usage.status).toBe("over");
  });

  it("does not report zero percent when spending has no configured limit", () => {
    const usage = calculateBudgetUsage("0.00", "90.00");

    expect(usage.percentage).toBeNull();
    expect(usage.progress).toBe(100);
    expect(budgetUsageLabel(usage.status)).toBe("Gasto sem limite");
  });
});
