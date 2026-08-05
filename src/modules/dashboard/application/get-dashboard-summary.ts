import { getDatabase } from "@/lib/db";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import { money, sumMoney } from "@/modules/shared/domain/money";
import { calculatePeriodResult } from "@/modules/transactions/domain/financial-summary";

function currentMonthInterval() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { end, start };
}

export async function getDashboardSummary(workspaceId: string) {
  const database = getDatabase();
  const { end, start } = currentMonthInterval();
  const [{ accounts, totalBalance }, periodTransactions, recentTransactions] = await Promise.all([
    getAccountBalances(workspaceId),
    database.transaction.findMany({
      where: { workspaceId, competenceDate: { gte: start, lt: end } },
      select: {
        accountId: true,
        amount: true,
        category: { select: { color: true, id: true, name: true } },
        status: true,
        type: true,
      },
    }),
    database.transaction.findMany({
      where: { workspaceId },
      include: { account: true, category: true },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
  ]);

  const periodResult = calculatePeriodResult(periodTransactions);
  const pendingIncome = sumMoney(
    periodTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "INCOME")
      .map(({ amount }) => amount),
  );
  const pendingExpense = sumMoney(
    periodTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "EXPENSE")
      .map(({ amount }) => amount),
  );
  const expenseByCategory = new Map<
    string,
    { color: string; name: string; value: ReturnType<typeof money> }
  >();

  for (const transaction of periodTransactions) {
    if (transaction.status !== "SETTLED" || transaction.type !== "EXPENSE") {
      continue;
    }

    const key = transaction.category?.id ?? "uncategorized";
    const current = expenseByCategory.get(key) ?? {
      color: transaction.category?.color ?? "#9aa59d",
      name: transaction.category?.name ?? "Sem categoria",
      value: money(0),
    };
    current.value = money(current.value.plus(transaction.amount));
    expenseByCategory.set(key, current);
  }

  return {
    accounts,
    expenseByCategory: [...expenseByCategory.entries()]
      .map(([id, category]) => ({
        color: category.color,
        id,
        name: category.name,
        value: category.value.toNumber(),
      }))
      .sort((first, second) => second.value - first.value),
    pendingExpense,
    pendingIncome,
    periodResult,
    recentTransactions,
    totalBalance,
  };
}
