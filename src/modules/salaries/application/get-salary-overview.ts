import { getDatabase } from "@/lib/db";
import { monthStart } from "@/modules/fixed-expenses/domain/fixed-expense-schedule";
import {
  calculateSalaryTotals,
  createSalarySchedule,
} from "@/modules/salaries/domain/salary-schedule";
import { money } from "@/modules/shared/domain/money";

export async function getSalaryOverview(workspaceId: string, referenceDate = new Date()) {
  const database = getDatabase();
  const month = monthStart(referenceDate);
  const today = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), referenceDate.getUTCDate()),
  );
  const salaries = await database.salary.findMany({
    where: {
      workspaceId,
      OR: [
        { active: true, startMonth: { lte: month } },
        { transactions: { some: { salaryMonth: month } } },
      ],
    },
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
    const scheduledInstallments = createSalarySchedule({
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

    const installments = salary.active
      ? scheduledInstallments
      : scheduledInstallments.filter(({ payment }) => payment);

    return { ...salary, installments };
  });
  const installments = items.flatMap((salary) => salary.installments);
  const totals = calculateSalaryTotals(installments);
  const groupsByEditor = new Map<
    string,
    {
      editor: (typeof items)[number]["editor"];
      expected: ReturnType<typeof money>;
      items: typeof items;
      pending: ReturnType<typeof money>;
      received: ReturnType<typeof money>;
    }
  >();

  for (const item of items) {
    const current = groupsByEditor.get(item.editorId) ?? {
      editor: item.editor,
      expected: money(0),
      items: [],
      pending: money(0),
      received: money(0),
    };
    current.items.push(item);

    for (const installment of item.installments) {
      current.expected = money(current.expected.plus(installment.amount));

      if (installment.received && installment.payment) {
        current.received = money(current.received.plus(installment.payment.amount));
      } else {
        current.pending = money(current.pending.plus(installment.amount));
      }
    }

    groupsByEditor.set(item.editorId, current);
  }

  return {
    ...totals,
    editorGroups: [...groupsByEditor.values()],
    items,
    month,
    overdueCount: installments.filter(({ overdue }) => overdue).length,
  };
}
