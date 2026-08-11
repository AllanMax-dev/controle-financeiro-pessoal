import Decimal from "decimal.js";

import { getDatabase } from "@/lib/db";
import {
  addDays,
  buildPersonTotal,
  clampDayInMonth,
  monthBounds,
  sumPersonTotals,
} from "@/modules/finance/domain/finance-calculations";
import { money, sumMoney } from "@/modules/shared/domain/money";

export type FinanceAccess = {
  editorId: string;
  workspaceId: string;
  workspaceTimezone: string;
};

export type PersonOption = {
  id: string;
  name: string;
};

export type DashboardView = "casal" | string;

export function selectedMonthParam(value: string | string[] | undefined, fallback: string) {
  const month = Array.isArray(value) ? value[0] : value;

  return month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : fallback;
}

export function selectedViewParam(value: string | string[] | undefined) {
  const view = Array.isArray(value) ? value[0] : value;

  return view?.trim() || "casal";
}

export async function getPeople(workspaceId: string): Promise<PersonOption[]> {
  const people = await getDatabase().editor.findMany({
    where: { active: true, workspaceId },
    orderBy: { displayName: "asc" },
    select: { displayName: true, id: true },
  });

  return people.map((person) => ({ id: person.id, name: person.displayName }));
}

export async function getFinanceOptions(workspaceId: string) {
  const database = getDatabase();
  const [people, accounts, categories, cards, goals] = await Promise.all([
    getPeople(workspaceId),
    database.financialAccount.findMany({
      where: { active: true, workspaceId },
      orderBy: [{ personEditor: { displayName: "asc" } }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        personEditor: { select: { displayName: true } },
        personEditorId: true,
        type: true,
      },
    }),
    database.category.findMany({
      where: { active: true, workspaceId },
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: { color: true, id: true, kind: true, name: true },
    }),
    database.creditCard.findMany({
      where: { active: true, workspaceId },
      orderBy: [{ personEditor: { displayName: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, personEditor: { select: { displayName: true } }, personEditorId: true },
    }),
    database.savingsGoal.findMany({
      where: { status: "ACTIVE", workspaceId },
      orderBy: [{ personEditor: { displayName: "asc" } }, { name: "asc" }],
      select: { id: true, name: true, personEditor: { select: { displayName: true } }, personEditorId: true },
    }),
  ]);

  return { accounts, cards, categories, goals, people };
}

async function getAccountBalances(workspaceId: string) {
  const database = getDatabase();
  const [accounts, transactions, transfers, adjustments, invoicePayments] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId },
      include: { personEditor: { select: { displayName: true } } },
      orderBy: [{ personEditor: { displayName: "asc" } }, { name: "asc" }],
    }),
    database.transaction.findMany({
      where: { affectsBalance: true, status: "SETTLED", workspaceId },
      select: { accountId: true, amount: true, type: true },
    }),
    database.transfer.findMany({
      where: { status: "SETTLED", workspaceId },
      select: { amount: true, destinationAccountId: true, sourceAccountId: true },
    }),
    database.balanceAdjustment.findMany({
      where: { workspaceId },
      select: { accountId: true, difference: true },
    }),
    database.creditCardInvoicePayment.findMany({
      where: { workspaceId },
      select: { accountId: true, amount: true },
    }),
  ]);
  const balances = new Map(accounts.map((account) => [account.id, money(account.initialBalance)]));

  for (const transaction of transactions) {
    if (!transaction.accountId) {
      continue;
    }

    const current = balances.get(transaction.accountId) ?? money(0);
    balances.set(
      transaction.accountId,
      transaction.type === "INCOME" ? money(current.plus(transaction.amount)) : money(current.minus(transaction.amount)),
    );
  }

  for (const transfer of transfers) {
    balances.set(transfer.sourceAccountId, money((balances.get(transfer.sourceAccountId) ?? money(0)).minus(transfer.amount)));
    balances.set(transfer.destinationAccountId, money((balances.get(transfer.destinationAccountId) ?? money(0)).plus(transfer.amount)));
  }

  for (const adjustment of adjustments) {
    balances.set(adjustment.accountId, money((balances.get(adjustment.accountId) ?? money(0)).plus(adjustment.difference)));
  }

  for (const payment of invoicePayments) {
    balances.set(payment.accountId, money((balances.get(payment.accountId) ?? money(0)).minus(payment.amount)));
  }

  return accounts.map((account) => ({
    ...account,
    balance: balances.get(account.id) ?? money(0),
  }));
}

function salaryExpectedAmount(salary: { amount: Decimal; frequency: "MONTHLY" | "FORTNIGHTLY" }) {
  return salary.frequency === "FORTNIGHTLY" ? money(salary.amount.times(2)) : money(salary.amount);
}

export async function getFinanceOverview(workspaceId: string, month: string, view: DashboardView = "casal") {
  const database = getDatabase();
  const { end, start } = monthBounds(month);
  const [
    people,
    accounts,
    categories,
    transactions,
    fixedExpenses,
    salaries,
    debts,
    debtInstallments,
    cards,
    cardInstallments,
    cardPurchases,
    allOpenCardInstallments,
    invoices,
    invoicePayments,
    goals,
    goalMovementTotals,
    visibleGoalMovements,
    investments,
    transfers,
    balanceAdjustments,
  ] = await Promise.all([
    getPeople(workspaceId),
    getAccountBalances(workspaceId),
    database.category.findMany({ where: { workspaceId }, orderBy: { name: "asc" } }),
    database.transaction.findMany({
      where: { competenceDate: { gte: start, lt: end }, status: { not: "CANCELED" }, workspaceId },
      include: { account: true, category: true, personEditor: true },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 80,
    }),
    database.fixedExpense.findMany({
      where: {
        active: true,
        startMonth: { lt: end },
        workspaceId,
        OR: [{ endedAt: null }, { endedAt: { gte: start } }],
      },
      include: { category: true, personEditor: true },
      orderBy: [{ dueDay: "asc" }, { description: "asc" }],
    }),
    database.salary.findMany({
      where: {
        active: true,
        startMonth: { lt: end },
        workspaceId,
        OR: [{ archivedAt: null }, { archivedAt: { gte: start } }],
      },
      include: { personEditor: true },
      orderBy: [{ paymentDay: "asc" }, { description: "asc" }],
    }),
    database.debt.findMany({
      where: {
        active: true,
        workspaceId,
      },
      include: { category: true, personEditor: true },
      orderBy: [{ firstDueDate: "asc" }, { description: "asc" }],
    }),
    database.debtInstallment.findMany({
      where: { dueDate: { gte: start, lt: end }, status: { not: "CANCELED" }, workspaceId },
      include: { debt: true, personEditor: true },
      orderBy: [{ dueDate: "asc" }, { number: "asc" }],
    }),
    database.creditCard.findMany({
      where: { workspaceId },
      include: { personEditor: true },
      orderBy: [{ personEditor: { displayName: "asc" } }, { name: "asc" }],
    }),
    database.creditCardInstallment.findMany({
      where: { dueMonth: { gte: start, lt: end }, status: "OPEN", workspaceId },
      include: { card: true, personEditor: true, purchase: true },
      orderBy: [{ dueMonth: "asc" }, { createdAt: "asc" }],
    }),
    database.creditCardPurchase.findMany({
      where: { purchaseDate: { gte: start, lt: end }, workspaceId },
      include: { card: true, category: true, personEditor: true },
      orderBy: [{ purchaseDate: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    database.creditCardInstallment.findMany({
      where: { invoice: { is: { status: { not: "PAID" } } }, status: "OPEN", workspaceId },
      select: { amount: true, cardId: true },
    }),
    database.creditCardInvoice.findMany({
      where: { month: start, workspaceId },
      include: { card: true, personEditor: true },
      orderBy: [{ personEditor: { displayName: "asc" } }, { dueDate: "asc" }],
    }),
    database.creditCardInvoicePayment.findMany({
      where: { paidAt: { gte: start, lt: end }, workspaceId },
      include: { account: true, invoice: { include: { card: true } }, personEditor: true },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    database.savingsGoal.findMany({
      where: { workspaceId },
      include: { personEditor: true },
      orderBy: [{ personEditor: { displayName: "asc" } }, { name: "asc" }],
    }),
    database.savingsGoalMovement.findMany({
      where: { workspaceId },
      select: { amount: true, goalId: true, type: true },
    }),
    database.savingsGoalMovement.findMany({
      where: { movementDate: { gte: start, lt: end }, workspaceId },
      include: { account: true, goal: true, personEditor: true },
      orderBy: [{ movementDate: "desc" }, { createdAt: "desc" }],
      take: 40,
    }),
    database.investment.findMany({
      where: { active: true, workspaceId },
      include: { personEditor: true },
      orderBy: [{ personEditor: { displayName: "asc" } }, { name: "asc" }],
    }),
    database.transfer.findMany({
      where: { transferDate: { gte: start, lt: end }, workspaceId },
      include: { destinationAccount: true, sourceAccount: true },
      orderBy: [{ transferDate: "desc" }],
      take: 20,
    }),
    database.balanceAdjustment.findMany({
      where: { effectiveAt: { gte: start, lt: end }, workspaceId },
      include: { account: true, personEditor: true },
      orderBy: [{ effectiveAt: "desc" }, { createdAt: "desc" }],
      take: 20,
    }),
  ]);
  const goalTotals = new Map<string, Decimal>();

  for (const movement of goalMovementTotals) {
    const current = goalTotals.get(movement.goalId) ?? money(0);
    goalTotals.set(
      movement.goalId,
      movement.type === "DEPOSIT" ? money(current.plus(movement.amount)) : money(current.minus(movement.amount)),
    );
  }

  const totalsByPerson = people.map((person) => {
    const personAccounts = accounts.filter((account) => account.personEditorId === person.id && account.active);
    const personTransactions = transactions.filter((transaction) => transaction.personEditorId === person.id);
    const personFixed = fixedExpenses.filter((fixedExpense) => fixedExpense.personEditorId === person.id);
    const personSalaries = salaries.filter((salary) => salary.personEditorId === person.id);
    const personDebt = debtInstallments.filter((installment) => installment.personEditorId === person.id);
    const personCardInstallments = cardInstallments.filter((installment) => installment.personEditorId === person.id);
    const personInvoices = invoices.filter((invoice) => invoice.personEditorId === person.id);
    const personInvestments = investments.filter((investment) => investment.personEditorId === person.id);
    const transactionIncome = sumMoney(personTransactions.filter(({ type }) => type === "INCOME").map(({ amount }) => amount));
    const transactionExpenses = sumMoney(personTransactions.filter(({ type }) => type === "EXPENSE").map(({ amount }) => amount));
    const fixedTotal = sumMoney(personFixed.map(({ amount }) => amount));
    const salaryTotal = sumMoney(personSalaries.map(salaryExpectedAmount));
    const debtTotal = sumMoney(personDebt.map(({ amount }) => amount));
    const cardTotal = sumMoney(personCardInstallments.map(({ amount }) => amount));
    const invoicePending = sumMoney(personInvoices.map((invoice) => money(invoice.amount).minus(invoice.paidAmount)));
    const available = sumMoney(personAccounts.filter(({ type }) => type !== "INVESTMENT").map(({ balance }) => balance));
    const investmentAccounts = sumMoney(personAccounts.filter(({ type }) => type === "INVESTMENT").map(({ balance }) => balance));
    const investmentRecords = sumMoney(personInvestments.map(({ amount }) => amount));
    const paid = sumMoney(
      personTransactions
        .filter(({ status, type }) => status === "SETTLED" && type === "EXPENSE")
        .map(({ amount }) => amount),
    );
    const pendingTransactions = sumMoney(
      personTransactions
        .filter(({ status, type }) => status === "PENDING" && type === "EXPENSE")
        .map(({ amount }) => amount),
    );

    return {
      id: person.id,
      name: person.name,
      total: buildPersonTotal({
        available,
        expenses: transactionExpenses.plus(fixedTotal).plus(debtTotal).plus(cardTotal),
        income: transactionIncome.plus(salaryTotal),
        investments: investmentAccounts.plus(investmentRecords),
        paid,
        pending: pendingTransactions.plus(fixedTotal).plus(debtTotal).plus(invoicePending),
      }),
    };
  });
  const coupleTotal = sumPersonTotals(totalsByPerson.map(({ total }) => total));
  const activeView = view === "casal" || !people.some(({ id }) => id === view) ? "casal" : view;
  const visiblePersonIds = activeView === "casal" ? people.map(({ id }) => id) : [activeView];
  const personIsVisible = (personEditorId: string) => visiblePersonIds.includes(personEditorId);
  const cardsWithInvoices = cards.map((card) => {
    const invoice = invoices.find(({ cardId }) => cardId === card.id);
    const committed = sumMoney(allOpenCardInstallments.filter(({ cardId }) => cardId === card.id).map(({ amount }) => amount));

    return {
      ...card,
      committed,
      invoiceId: invoice?.id ?? null,
      invoiceAmount: invoice?.amount ?? money(0),
      invoiceDueDate: invoice?.dueDate ?? clampDayInMonth(start, card.dueDay),
      invoicePaidAmount: invoice?.paidAmount ?? money(0),
      invoiceStatus: invoice?.status ?? "OPEN",
      limitAvailable: money(card.limit.minus(committed)),
    };
  });
  const goalsWithTotals = goals.map((goal) => ({
    ...goal,
    currentAmount: goalTotals.get(goal.id) ?? money(0),
  }));
  const salaryOccurrences = salaries.flatMap((salary) => {
    const firstDueDate = clampDayInMonth(start, salary.paymentDay);
    const dueDates = (salary.frequency === "FORTNIGHTLY" ? [firstDueDate, addDays(firstDueDate, 14)] : [firstDueDate]).filter(
      (dueDate) => dueDate >= salary.startMonth && dueDate < end && (!salary.archivedAt || dueDate <= salary.archivedAt),
    );

    return dueDates.map((dueDate, index) => {
      const salaryTransaction = transactions.find(
        (transaction) =>
          transaction.salaryId === salary.id &&
          transaction.type === "INCOME" &&
          transaction.competenceDate.getTime() === dueDate.getTime(),
      );

      return {
        amount: salary.amount,
        description: salary.description,
        dueDate,
        id: `${salary.id}-${dueDate.toISOString().slice(0, 10)}-${index + 1}`,
        installmentNumber: index + 1,
        personEditor: salary.personEditor,
        personEditorId: salary.personEditorId,
        salaryId: salary.id,
        status: salaryTransaction?.status === "SETTLED" ? "SETTLED" : "PENDING",
        transactionId: salaryTransaction?.id ?? null,
      };
    });
  });

  return {
    accounts: accounts.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    activeView,
    cardInstallments: cardInstallments.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    cardPurchases: cardPurchases.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    cards: cardsWithInvoices.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    categories,
    coupleTotal,
    balanceAdjustments: balanceAdjustments.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    debts: debts.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    debtInstallments: debtInstallments.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    fixedExpenses: fixedExpenses.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    goalMovements: visibleGoalMovements.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    goals: goalsWithTotals.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    investments: investments.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    invoicePayments: invoicePayments.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    month,
    people,
    salaries: salaries.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    salaryOccurrences: salaryOccurrences.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    transactions: transactions.filter(({ personEditorId }) => personIsVisible(personEditorId)),
    transfers: transfers.filter(
      ({ destinationPersonEditorId, sourcePersonEditorId }) =>
        personIsVisible(sourcePersonEditorId) || personIsVisible(destinationPersonEditorId),
    ),
    totalsByPerson,
  };
}

export async function getAccountCurrentBalance(workspaceId: string, accountId: string) {
  const account = (await getAccountBalances(workspaceId)).find(({ id }) => id === accountId);

  return account?.balance ?? money(0);
}
