import { describe, expect, it } from "vitest";

import { normalizeTransactionListFilters, transactionStatusCriteria } from "../../src/modules/transactions/application/transaction-list-filters";

describe("transaction list filters", () => {
  const referenceDate = new Date("2026-08-15T12:00:00.000Z");

  it("uses the selected month as the default period", () => {
    const filters = normalizeTransactionListFilters({ month: "2026-07" }, referenceDate);

    expect(filters.startDate).toBe("2026-07-01");
    expect(filters.endDate).toBe("2026-07-31");
    expect(filters.start.toISOString()).toBe("2026-07-01T00:00:00.000Z");
    expect(filters.end.toISOString()).toBe("2026-08-01T00:00:00.000Z");
  });

  it("accepts explicit periods, search text, enums and workspace-scoped ids", () => {
    const filters = normalizeTransactionListFilters(
      {
        accountId: "11111111-1111-4111-8111-111111111111",
        categoryId: "22222222-2222-4222-8222-222222222222",
        endDate: "2026-08-20",
        personId: "33333333-3333-4333-8333-333333333333",
        q: "  mercado   central  ",
        startDate: "2026-08-10",
        status: "SETTLED",
        type: "EXPENSE",
      },
      referenceDate,
    );

    expect(filters.accountId).toBe("11111111-1111-4111-8111-111111111111");
    expect(filters.categoryId).toBe("22222222-2222-4222-8222-222222222222");
    expect(filters.personId).toBe("33333333-3333-4333-8333-333333333333");
    expect(filters.search).toBe("mercado central");
    expect(filters.status).toBe("SETTLED");
    expect(filters.type).toBe("EXPENSE");
    expect(filters.start.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(filters.end.toISOString()).toBe("2026-08-21T00:00:00.000Z");
  });

  it("keeps canceled transactions out of the operational view by default", () => {
    expect(transactionStatusCriteria()).toEqual({});
    expect(transactionStatusCriteria("CANCELED")).toEqual({ status: "CANCELED" });
  });

  it("falls back safely when the period or enum values are invalid", () => {
    const filters = normalizeTransactionListFilters(
      {
        accountId: "conta-invalida",
        endDate: "2026-08-01",
        startDate: "2026-08-30",
        status: "PAID",
        type: "TRANSFER",
      },
      referenceDate,
    );

    expect(filters.accountId).toBeUndefined();
    expect(filters.status).toBeUndefined();
    expect(filters.type).toBeUndefined();
    expect(filters.startDate).toBe("2026-08-01");
    expect(filters.endDate).toBe("2026-08-31");
  });
});
