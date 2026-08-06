import { beforeEach, describe, expect, it, vi } from "vitest";

const databaseMocks = vi.hoisted(() => ({
  createMany: vi.fn(),
  findExistingTransactions: vi.fn(),
  findFixedExpenses: vi.fn(),
  findWorkspace: vi.fn(),
}));

vi.mock("../../src/lib/db", () => ({
  getDatabase: () => ({
    fixedExpense: { findMany: databaseMocks.findFixedExpenses },
    transaction: {
      createMany: databaseMocks.createMany,
      findMany: databaseMocks.findExistingTransactions,
    },
    workspace: { findUniqueOrThrow: databaseMocks.findWorkspace },
  }),
}));

import { synchronizeDueFixedExpenses } from "../../src/modules/fixed-expenses/application/synchronize-due-fixed-expenses";

describe("fixed expense synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    databaseMocks.findWorkspace.mockResolvedValue({ timezone: "America/Sao_Paulo" });
    databaseMocks.findFixedExpenses.mockResolvedValue([
      {
        accountId: "account-id",
        amount: "150.00",
        categoryId: "category-id",
        description: "Internet",
        dueDay: 10,
        id: "fixed-expense-id",
        notes: null,
        startMonth: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    databaseMocks.findExistingTransactions.mockResolvedValue([
      {
        fixedExpenseId: "fixed-expense-id",
        recurrenceMonth: new Date("2026-06-01T00:00:00.000Z"),
      },
    ]);
    databaseMocks.createMany.mockResolvedValue({ count: 1 });
  });

  it("creates only missing due months as settled expenses", async () => {
    const synchronizedThrough = await synchronizeDueFixedExpenses(
      "workspace-id",
      new Date("2026-08-10T15:00:00.000Z"),
    );

    expect(synchronizedThrough.toISOString()).toBe("2026-08-10T00:00:00.000Z");
    expect(databaseMocks.createMany).toHaveBeenCalledOnce();
    const call = databaseMocks.createMany.mock.calls[0]?.[0];

    expect(call.skipDuplicates).toBe(true);
    expect(
      call.data.map((occurrence: { recurrenceMonth: Date }) =>
        occurrence.recurrenceMonth.toISOString(),
      ),
    ).toEqual(["2026-07-01T00:00:00.000Z", "2026-08-01T00:00:00.000Z"]);
    expect(call.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          amount: "150.00",
          settledAt: new Date("2026-08-10T00:00:00.000Z"),
          status: "SETTLED",
          type: "EXPENSE",
        }),
      ]),
    );
  });
});
