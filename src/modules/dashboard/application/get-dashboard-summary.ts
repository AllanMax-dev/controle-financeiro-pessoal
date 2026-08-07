import { getDatabase } from "@/lib/db";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import {
  buildBudgetComparison,
  buildExpenseDistribution,
  buildMonthlyEvolution,
  calculateProjectedBalance,
  createTrailingMonthBuckets,
} from "@/modules/dashboard/domain/dashboard-analytics";
import { getFixedExpenseOverview } from "@/modules/fixed-expenses/application/get-fixed-expense-overview";
import { getSalaryOverview } from "@/modules/salaries/application/get-salary-overview";
import { money, sumMoney } from "@/modules/shared/domain/money";
import { calculatePeriodResult } from "@/modules/transactions/domain/financial-summary";

export async function getDashboardSummary(workspaceId: string, referenceDate = new Date()) {
  const database = getDatabase();
  const monthBuckets = createTrailingMonthBuckets(6, referenceDate);
  const firstMonth = monthBuckets[0]!;
  const currentMonth = monthBuckets[monthBuckets.length - 1]!;
  // Sincroniza antes das consultas paralelas para que todos os indicadores usem a mesma base.
  const fixedExpenses = await getFixedExpenseOverview(workspaceId, referenceDate);
  const [
    {
      accounts,
      availableBalance,
      investmentBalance,
      ownerGroups,
      totalBalance,
    },
    transactions,
    recentTransactions,
    budgets,
    salaries,
    manualPendingExpenses,
    manualPendingIncome,
  ] = await Promise.all([
    getAccountBalances(workspaceId, false),
    database.transaction.findMany({
      where: { workspaceId, competenceDate: { gte: firstMonth.start, lt: currentMonth.end } },
      select: {
        account: { select: { type: true } },
        accountId: true,
        amount: true,
        category: { select: { color: true, id: true, name: true } },
        competenceDate: true,
        fixedExpenseId: true,
        salaryId: true,
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
    database.budget.findMany({
      where: { workspaceId, month: currentMonth.start },
      select: {
        amount: true,
        category: { select: { color: true, id: true, name: true } },
      },
    }),
    getSalaryOverview(workspaceId, referenceDate),
    database.transaction.findMany({
      where: {
        competenceDate: { gte: currentMonth.start, lt: currentMonth.end },
        account: { type: { not: "INVESTMENT" } },
        fixedExpenseId: null,
        status: "PENDING",
        type: "EXPENSE",
        workspaceId,
      },
      include: { account: true, category: true },
      orderBy: [{ dueDate: "asc" }, { competenceDate: "asc" }, { createdAt: "asc" }],
      take: 6,
    }),
    database.transaction.findMany({
      where: {
        competenceDate: { gte: currentMonth.start, lt: currentMonth.end },
        account: { type: { not: "INVESTMENT" } },
        salaryId: null,
        status: "PENDING",
        type: "INCOME",
        workspaceId,
      },
      include: { account: true, category: true },
      orderBy: [{ dueDate: "asc" }, { competenceDate: "asc" }, { createdAt: "asc" }],
      take: 6,
    }),
  ]);
  const periodTransactions = transactions.filter(
    ({ competenceDate }) =>
      competenceDate >= currentMonth.start && competenceDate < currentMonth.end,
  );
  const operationalPeriodTransactions = periodTransactions.filter(
    ({ account }) => account.type !== "INVESTMENT",
  );

  const periodResult = calculatePeriodResult(operationalPeriodTransactions);
  const pendingTransactionIncome = sumMoney(
    operationalPeriodTransactions
      .filter(({ status, type }) => status === "PENDING" && type === "INCOME")
      .map(({ amount }) => amount),
  );
  const pendingIncome = money(pendingTransactionIncome.plus(salaries.pending));
  const pendingTransactionExpense = sumMoney(
    operationalPeriodTransactions
      .filter(
        ({ fixedExpenseId, status, type }) =>
          status === "PENDING" && type === "EXPENSE" && !fixedExpenseId,
      )
      .map(({ amount }) => amount),
  );
  const pendingExpense = money(pendingTransactionExpense.plus(fixedExpenses.pending));

  return {
    accounts,
    accountOwnerGroups: ownerGroups,
    availableBalance,
    budgetComparison: buildBudgetComparison(budgets, periodTransactions),
    expenseByCategory: buildExpenseDistribution(periodTransactions),
    financialNetWorth: totalBalance,
    fixedExpenses,
    investmentBalance,
    manualPendingExpenses,
    manualPendingIncome,
    monthlyEvolution: buildMonthlyEvolution(transactions, monthBuckets),
    pendingExpense,
    pendingIncome,
    periodResult,
    projectedBalance: calculateProjectedBalance(availableBalance, pendingIncome, pendingExpense),
    recentTransactions,
    salaries,
    totalBalance,
  };
}
