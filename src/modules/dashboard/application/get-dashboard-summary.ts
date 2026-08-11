import { getDatabase } from "@/lib/db";
import {
  financialContextIds,
  financialContextWhere,
  transferContextWhere,
  type FinancialContextFilter,
} from "@/modules/financial-contexts/application/financial-contexts";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import { getCreditCardInstallmentExpenses } from "@/modules/credit-cards/application/get-credit-card-expenses";
import {
  buildBudgetComparison,
  buildExpenseDistribution,
  buildMonthlyEvolution,
  calculatePendingTransferAvailableDelta,
  calculateProjectedBalance,
  createTrailingMonthBuckets,
} from "@/modules/dashboard/domain/dashboard-analytics";
import { getFixedExpenseOverview } from "@/modules/fixed-expenses/application/get-fixed-expense-overview";
import { getSalaryOverview } from "@/modules/salaries/application/get-salary-overview";
import { money, sumMoney } from "@/modules/shared/domain/money";
import { calculatePeriodResult } from "@/modules/transactions/domain/financial-summary";

export async function getDashboardSummary(
  workspaceId: string,
  referenceDate = new Date(),
  scope?: FinancialContextFilter,
) {
  const database = getDatabase();
  const monthBuckets = createTrailingMonthBuckets(6, referenceDate);
  const firstMonth = monthBuckets[0]!;
  const currentMonth = monthBuckets[monthBuckets.length - 1]!;
  // Sincroniza antes das consultas paralelas para que todos os indicadores usem a mesma base.
  const fixedExpenses = await getFixedExpenseOverview(workspaceId, referenceDate, new Date(), scope);
  const [
    {
      accounts,
      availableBalance,
      investmentBalance,
      ownerGroups,
      totalBalance,
    },
    transactions,
    creditCardExpenses,
    recentTransactions,
    budgets,
    salaries,
    manualPendingExpenses,
    manualPendingIncome,
    pendingTransfers,
  ] = await Promise.all([
    getAccountBalances(workspaceId, false, scope),
    database.transaction.findMany({
      where: {
        workspaceId,
        ...financialContextWhere(scope),
        competenceDate: { gte: firstMonth.start, lt: currentMonth.end },
        creditCardInvoiceId: null,
      },
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
    getCreditCardInstallmentExpenses(workspaceId, scope, firstMonth.start, currentMonth.end),
    database.transaction.findMany({
      where: { workspaceId, ...financialContextWhere(scope) },
      include: { account: true, category: true },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 6,
    }),
    database.budget.findMany({
      where: { workspaceId, ...financialContextWhere(scope), month: currentMonth.start },
      select: {
        amount: true,
        category: { select: { color: true, id: true, name: true } },
      },
    }),
    getSalaryOverview(workspaceId, referenceDate, scope),
    database.transaction.findMany({
      where: {
        ...financialContextWhere(scope),
        competenceDate: { gte: currentMonth.start, lt: currentMonth.end },
        account: { type: { not: "INVESTMENT" } },
        fixedExpenseId: null,
        creditCardInvoiceId: null,
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
        ...financialContextWhere(scope),
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
    database.transfer.findMany({
      where: {
        status: "PENDING",
        transferDate: { gte: currentMonth.start, lt: currentMonth.end },
        workspaceId,
        ...transferContextWhere(scope),
      },
      select: {
        amount: true,
        destinationAccount: { select: { type: true } },
        destinationContextId: true,
        sourceAccount: { select: { type: true } },
        sourceContextId: true,
        status: true,
      },
    }),
  ]);
  const analyticTransactions = [...transactions, ...creditCardExpenses];
  const periodTransactions = analyticTransactions.filter(
    ({ competenceDate }) =>
      competenceDate >= currentMonth.start && competenceDate < currentMonth.end,
  );
  const operationalPeriodTransactions = periodTransactions.filter(
    ({ account }) => account?.type !== "INVESTMENT",
  );

  const periodResult = calculatePeriodResult(operationalPeriodTransactions);
  const pendingTransferDelta = calculatePendingTransferAvailableDelta(pendingTransfers, financialContextIds(scope));
  const pendingTransactionIncome = sumMoney(
    operationalPeriodTransactions
      .filter(
        ({ salaryId, status, type }) =>
          status === "PENDING" && type === "INCOME" && !salaryId,
      )
      .map(({ amount }) => amount),
  );
  const pendingSalaryIncome = sumMoney(
    salaries.items
      .filter(({ account }) => account.type !== "INVESTMENT")
      .flatMap(({ installments }) =>
        installments.filter(({ received }) => !received).map(({ amount }) => amount),
      ),
  );
  const pendingIncome = money(pendingTransactionIncome.plus(pendingSalaryIncome));
  const pendingTransactionExpense = sumMoney(
    operationalPeriodTransactions
      .filter(
        ({ fixedExpenseId, status, type }) =>
          status === "PENDING" && type === "EXPENSE" && !fixedExpenseId,
      )
      .map(({ amount }) => amount),
  );
  const pendingFixedExpense = sumMoney(
    fixedExpenses.items
      .filter(({ account, paid }) => account.type !== "INVESTMENT" && !paid)
      .map(({ amount }) => amount),
  );
  const pendingExpense = money(pendingTransactionExpense.plus(pendingFixedExpense));

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
    monthlyEvolution: buildMonthlyEvolution(analyticTransactions, monthBuckets),
    pendingExpense,
    pendingIncome,
    periodResult,
    pendingTransferDelta,
    projectedBalance: calculateProjectedBalance(
      availableBalance,
      pendingIncome,
      pendingExpense,
      pendingTransferDelta,
    ),
    recentTransactions,
    salaries,
    totalBalance,
  };
}
