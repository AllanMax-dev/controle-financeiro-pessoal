import { getDatabase } from "@/lib/db";
import {
  calculateFixedExpenseTotals,
  fixedExpenseDueDate,
  monthStart,
} from "@/modules/fixed-expenses/domain/fixed-expense-schedule";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { money } from "@/modules/shared/domain/money";

export async function getFixedExpenseOverview(
  workspaceId: string,
  referenceDate = new Date(),
  asOfDate = new Date(),
) {
  const database = getDatabase();
  const month = monthStart(referenceDate);
  const today = await synchronizeDueFixedExpenses(workspaceId, asOfDate);
  const fixedExpenses = await database.fixedExpense.findMany({
    where: {
      workspaceId,
      OR: [
        { active: true, startMonth: { lte: month } },
        { transactions: { some: { recurrenceMonth: month } } },
      ],
    },
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
  const groupsByEditor = new Map<
    string,
    {
      editor: (typeof items)[number]["editor"];
      expected: ReturnType<typeof money>;
      items: typeof items;
      paid: ReturnType<typeof money>;
      pending: ReturnType<typeof money>;
    }
  >();

  for (const item of items) {
    const current = groupsByEditor.get(item.editorId) ?? {
      editor: item.editor,
      expected: money(0),
      items: [],
      paid: money(0),
      pending: money(0),
    };
    current.expected = money(current.expected.plus(item.amount));
    current.items.push(item);

    if (item.paid && item.payment) {
      current.paid = money(current.paid.plus(item.payment.amount));
    } else {
      current.pending = money(current.pending.plus(item.amount));
    }

    groupsByEditor.set(item.editorId, current);
  }

  return {
    ...totals,
    editorGroups: [...groupsByEditor.values()],
    items,
    month,
    overdueCount: items.filter(({ overdue }) => overdue).length,
  };
}
