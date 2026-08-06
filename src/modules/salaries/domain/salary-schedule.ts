import { allocateMoney, sumMoney, type MoneyInput } from "@/modules/shared/domain/money";

export type SalaryFrequencyInput = "MONTHLY" | "FORTNIGHTLY";

export type SalaryScheduleItem = {
  amount: ReturnType<typeof sumMoney>;
  dueDate: Date;
  installment: number;
};

function paymentDate(month: Date, day: number): Date {
  const lastDay = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  ).getUTCDate();

  return new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), Math.min(day, lastDay)),
  );
}

export function createSalarySchedule({
  amount,
  frequency,
  month,
  paymentDay,
}: {
  amount: MoneyInput;
  frequency: SalaryFrequencyInput;
  month: Date;
  paymentDay: number | null;
}): SalaryScheduleItem[] {
  if (frequency === "MONTHLY") {
    if (!paymentDay || !Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) {
      throw new RangeError("Informe um dia de recebimento entre 1 e 31.");
    }

    return [{ amount: allocateMoney(amount, 1)[0]!, dueDate: paymentDate(month, paymentDay), installment: 1 }];
  }

  const amounts = allocateMoney(amount, 2);

  return [
    { amount: amounts[0]!, dueDate: paymentDate(month, 15), installment: 1 },
    { amount: amounts[1]!, dueDate: paymentDate(month, 30), installment: 2 },
  ];
}

export function calculateSalaryTotals(
  installments: Array<{
    amount: MoneyInput;
    payment?: { amount: MoneyInput; status: "PENDING" | "SETTLED" | "CANCELED" } | null;
  }>,
) {
  const received = installments.filter(({ payment }) => payment?.status === "SETTLED");
  const pending = installments.filter(({ payment }) => payment?.status !== "SETTLED");

  return {
    expected: sumMoney(installments.map(({ amount }) => amount)),
    pending: sumMoney(pending.map(({ amount }) => amount)),
    pendingCount: pending.length,
    received: sumMoney(received.map(({ payment }) => payment!.amount)),
    receivedCount: received.length,
  };
}
