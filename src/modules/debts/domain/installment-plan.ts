import Decimal from "decimal.js";

import { allocateMoney, money, sumMoney, type MoneyInput } from "@/modules/shared/domain/money";

export type DebtShareInput = {
  amount: MoneyInput;
  editorId: string;
};

export type DebtInstallmentFrequency = "MONTHLY" | "FORTNIGHTLY";

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

function lastDayOfMonth(date: Date): number {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
}

export function isFortnightlyDueDate(date: Date): boolean {
  return date.getUTCDate() === 15 || date.getUTCDate() === Math.min(30, lastDayOfMonth(date));
}

export function addFortnightlyPeriods(date: Date, periods: number): Date {
  let dueDate = new Date(date.getTime());

  for (let index = 0; index < periods; index += 1) {
    dueDate = dueDate.getUTCDate() === 15
      ? new Date(
          Date.UTC(
            dueDate.getUTCFullYear(),
            dueDate.getUTCMonth(),
            Math.min(30, lastDayOfMonth(dueDate)),
          ),
        )
      : new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth() + 1, 15));
  }

  return dueDate;
}

export function installmentDueDate(
  firstDueDate: Date,
  installmentIndex: number,
  installmentFrequency: DebtInstallmentFrequency,
): Date {
  return installmentFrequency === "FORTNIGHTLY"
    ? addFortnightlyPeriods(firstDueDate, installmentIndex)
    : addCalendarMonths(firstDueDate, installmentIndex);
}

export function defaultFirstDueDate(
  purchaseDate: Date,
  installmentFrequency: DebtInstallmentFrequency = "MONTHLY",
): Date {
  if (installmentFrequency === "FORTNIGHTLY") {
    const secondDueDay = Math.min(30, lastDayOfMonth(purchaseDate));

    if (purchaseDate.getUTCDate() < 15) {
      return new Date(Date.UTC(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth(), 15));
    }

    if (purchaseDate.getUTCDate() < secondDueDay) {
      return new Date(
        Date.UTC(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth(), secondDueDay),
      );
    }

    return new Date(Date.UTC(purchaseDate.getUTCFullYear(), purchaseDate.getUTCMonth() + 1, 15));
  }

  return addCalendarMonths(purchaseDate, 1);
}

export function inferPaidInstallmentCount(
  firstDueDate: Date,
  installmentCount: number,
  asOf = new Date(),
  installmentFrequency: DebtInstallmentFrequency = "MONTHLY",
): number {
  if (!Number.isInteger(installmentCount) || installmentCount <= 0) {
    return 0;
  }

  let paidCount = 0;

  for (let index = 0; index < installmentCount; index += 1) {
    if (installmentDueDate(firstDueDate, index, installmentFrequency) <= asOf) {
      paidCount += 1;
    }
  }

  return paidCount;
}

export function createDebtInstallmentPlan({
  firstDueDate,
  installmentCount,
  installmentFrequency = "MONTHLY",
  paidInstallments,
  shares,
  totalAmount,
}: {
  firstDueDate: Date;
  installmentCount: number;
  installmentFrequency?: DebtInstallmentFrequency;
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

  if (installmentFrequency === "FORTNIGHTLY" && !isFortnightlyDueDate(firstDueDate)) {
    throw new RangeError("O primeiro vencimento quinzenal deve ocorrer no dia 15 ou 30.");
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
      dueDate: installmentDueDate(firstDueDate, index, installmentFrequency),
      historical: index < paidInstallments,
      number: index + 1,
      shares: itemShares.filter(({ amount: shareAmount }) => shareAmount.isPositive()),
      status: index < paidInstallments ? "PAID" : "PENDING",
    };
  });
}
