import Decimal from "decimal.js";

import { allocateMoney, money, sumMoney, type MoneyInput } from "@/modules/shared/domain/money";

export type DebtShareInput = {
  amount: MoneyInput;
  editorId: string;
};

export type DebtInstallmentPlanItem = {
  amount: Decimal;
  dueDate: Date;
  historical: boolean;
  number: number;
  shares: Array<{ amount: Decimal; editorId: string }>;
  status: "PAID" | "PENDING";
};

export function addCalendarMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
}

export function defaultFirstDueDate(purchaseDate: Date): Date {
  return addCalendarMonths(purchaseDate, 1);
}

export function inferPaidInstallmentCount(
  firstDueDate: Date,
  installmentCount: number,
  asOf = new Date(),
): number {
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
    return 0;
  }

  let paidCount = 0;

  for (let index = 0; index < installmentCount; index += 1) {
    if (addCalendarMonths(firstDueDate, index) <= asOf) {
      paidCount += 1;
    }
  }

  return paidCount;
}

export function createDebtInstallmentPlan({
  firstDueDate,
  installmentCount,
  paidInstallments,
  shares,
  totalAmount,
}: {
  firstDueDate: Date;
  installmentCount: number;
  paidInstallments: number;
  shares: DebtShareInput[];
  totalAmount: MoneyInput;
}): DebtInstallmentPlanItem[] {
  if (shares.length < 1 || shares.length > 2) {
    throw new RangeError("Informe uma ou duas pessoas responsáveis pela dívida.");
  }

  if (!Number.isInteger(paidInstallments) || paidInstallments < 0 || paidInstallments > installmentCount) {
    throw new RangeError("A quantidade de parcelas pagas é inválida.");
  }

  if (new Set(shares.map(({ editorId }) => editorId)).size !== shares.length) {
    throw new RangeError("Cada pessoa deve aparecer somente uma vez na divisão.");
  }

  const normalizedTotal = money(totalAmount);
  const normalizedShares = shares.map((share) => ({ ...share, amount: money(share.amount) }));

  if (normalizedShares.some(({ amount }) => !amount.isPositive())) {
    throw new RangeError("Os valores individuais devem ser maiores que zero.");
  }

  if (!sumMoney(normalizedShares.map(({ amount }) => amount)).equals(normalizedTotal)) {
    throw new RangeError("A divisão entre as pessoas deve ser igual ao valor total.");
  }

  const installments = allocateMoney(normalizedTotal, installmentCount);

  if (installments.some((amount) => !amount.isPositive())) {
    throw new RangeError("O valor é muito baixo para a quantidade de parcelas informada.");
  }

  const firstShareInstallments = allocateMoney(normalizedShares[0].amount, installmentCount);

  return installments.map((amount, index) => {
    const itemShares = [
      { amount: firstShareInstallments[index], editorId: normalizedShares[0].editorId },
    ];

    if (normalizedShares[1]) {
      itemShares.push({
        amount: money(amount.minus(firstShareInstallments[index])),
        editorId: normalizedShares[1].editorId,
      });
    }

    return {
      amount,
      dueDate: addCalendarMonths(firstDueDate, index),
      historical: index < paidInstallments,
      number: index + 1,
      shares: itemShares.filter(({ amount: shareAmount }) => shareAmount.isPositive()),
      status: index < paidInstallments ? "PAID" : "PENDING",
    };
  });
}
