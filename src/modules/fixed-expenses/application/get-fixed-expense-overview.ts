import { getDatabase } from "@/lib/db";
import {
  calculateFixedExpenseTotals,
  fixedExpenseDueDate,
  monthStart,
} from "@/modules/fixed-expenses/domain/fixed-expense-schedule";
import { money } from "@/modules/shared/domain/money";

export async function getFixedExpenseOverview(
  workspaceId: string,
  referenceDate = new Date(),
) {
  const database = getDatabase();
  const month = monthStart(referenceDate);
  const today = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  const fixedExpenses = await database.fixedExpense.findMany({
    where: { workspaceId, active: true, startMonth: { lte: month } },
    include: {
      account: true,
      category: true,
      editor: true,
      transactions: {
        where: { recurrenceMonth: month },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ dueDay: "asc" }, { description: "asc" }],
  });
  const items = fixedExpenses.map((fixedExpense) => {
    const payment = fixedExpense.transactions[0] ?? null;
    const dueDate = fixedExpenseDueDate(month, fixedExpense.dueDay);
    const paid = payment?.status === "SETTLED";

    return {
      ...fixedExpense,
      dueDate,
      overdue: !paid && dueDate < today,
      paid,
      payment,
    };
  });
  const totals = calculateFixedExpenseTotals(
    items.map(({ amount, payment }) => ({
      amount,
      payment: payment ? { amount: payment.amount, status: payment.status } : null,
    })),
  );
  const byEditor = new Map<string, { expected: ReturnType<typeof money>; pending: ReturnType<typeof money> }>();

  for (const item of items) {
    const current = byEditor.get(item.editorId) ?? { expected: money(0), pending: money(0) };
    current.expected = money(current.expected.plus(item.amount));

    if (!item.paid) {
      current.pending = money(current.pending.plus(item.amount));
    }

    byEditor.set(item.editorId, current);
  }

  return {
    ...totals,
    byEditor,
    items,
    month,
    overdueCount: items.filter(({ overdue }) => overdue).length,
  };
}
