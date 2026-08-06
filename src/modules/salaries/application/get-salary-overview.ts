import { getDatabase } from "@/lib/db";
import { monthStart } from "@/modules/fixed-expenses/domain/fixed-expense-schedule";
import {
  calculateSalaryTotals,
  createSalarySchedule,
} from "@/modules/salaries/domain/salary-schedule";

export async function getSalaryOverview(workspaceId: string, referenceDate = new Date()) {
  const database = getDatabase();
  const month = monthStart(referenceDate);
  const today = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  const salaries = await database.salary.findMany({
    where: { workspaceId, active: true, startMonth: { lte: month } },
    include: {
      account: true,
      category: true,
      editor: true,
      transactions: {
        where: { salaryMonth: month },
        orderBy: { salaryInstallment: "asc" },
      },
    },
    orderBy: [{ description: "asc" }],
  });
  const items = salaries.map((salary) => {
    const installments = createSalarySchedule({
      amount: salary.amount,
      frequency: salary.frequency,
      month,
      paymentDay: salary.paymentDay,
    }).map((scheduled) => {
      const payment = salary.transactions.find(
        ({ salaryInstallment }) => salaryInstallment === scheduled.installment,
      ) ?? null;
      const received = payment?.status === "SETTLED";

      return {
        ...scheduled,
        overdue: !received && scheduled.dueDate < today,
        payment,
        received,
      };
    });

    return { ...salary, installments };
  });
  const installments = items.flatMap((salary) => salary.installments);
  const totals = calculateSalaryTotals(installments);

  return {
    ...totals,
    items,
    month,
    overdueCount: installments.filter(({ overdue }) => overdue).length,
  };
}
