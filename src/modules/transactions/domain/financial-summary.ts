import Decimal from "decimal.js";

import { money, sumMoney, type MoneyInput } from "@/modules/shared/domain/money";

export type BalanceAccount = {
  id: string;
  initialBalance: MoneyInput;
};

export type BalanceTransaction = {
  accountId: string;
  affectsBalance?: boolean;
  amount: MoneyInput;
  status: "PENDING" | "SETTLED" | "CANCELED";
  type: "INCOME" | "EXPENSE";
};

export type BalanceTransfer = {
  amount: MoneyInput;
  destinationAccountId: string;
  sourceAccountId: string;
  status: "PENDING" | "SETTLED" | "CANCELED";
};

export function calculateAccountBalances(
  accounts: BalanceAccount[],
  transactions: BalanceTransaction[],
  transfers: BalanceTransfer[],
): Map<string, Decimal> {
  const balances = new Map(accounts.map((account) => [account.id, money(account.initialBalance)]));

  for (const transaction of transactions) {
    if (
      transaction.status !== "SETTLED" ||
      transaction.affectsBalance === false ||
      !balances.has(transaction.accountId)
    ) {
      continue;
    }

    const currentBalance = balances.get(transaction.accountId) ?? money(0);
    const signedAmount =
      transaction.type === "INCOME" ? money(transaction.amount) : money(transaction.amount).negated();
    balances.set(transaction.accountId, money(currentBalance.plus(signedAmount)));
  }

  for (const transfer of transfers) {
    if (transfer.status !== "SETTLED") {
      continue;
    }

    if (balances.has(transfer.sourceAccountId)) {
      const sourceBalance = balances.get(transfer.sourceAccountId) ?? money(0);
      balances.set(transfer.sourceAccountId, money(sourceBalance.minus(transfer.amount)));
    }

    if (balances.has(transfer.destinationAccountId)) {
      const destinationBalance = balances.get(transfer.destinationAccountId) ?? money(0);
      balances.set(
        transfer.destinationAccountId,
        money(destinationBalance.plus(transfer.amount)),
      );
    }
  }

  return balances;
}

export function calculateConsolidatedBalance(balances: Map<string, Decimal>): Decimal {
  return sumMoney([...balances.values()]);
}

export function calculatePeriodResult(transactions: BalanceTransaction[]) {
  const settledTransactions = transactions.filter(({ status }) => status === "SETTLED");
  const income = sumMoney(
    settledTransactions.filter(({ type }) => type === "INCOME").map(({ amount }) => amount),
  );
  const expense = sumMoney(
    settledTransactions.filter(({ type }) => type === "EXPENSE").map(({ amount }) => amount),
  );

  return {
    income,
    expense,
    result: money(income.minus(expense)),
  };
}
