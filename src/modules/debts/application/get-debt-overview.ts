import { getDatabase } from "@/lib/db";
import { money, sumMoney } from "@/modules/shared/domain/money";

function currentMonthInterval(referenceDate: Date) {
  const today = new Date(
    Date.UTC(
      referenceDate.getUTCFullYear(),
      referenceDate.getUTCMonth(),
      referenceDate.getUTCDate(),
    ),
  );
  const start = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1),
  );
  const end = new Date(
    Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() + 1, 1),
  );
  return { end, start, today };
}

export async function getDebtOverview(
  workspaceId: string,
  referenceDate = new Date(),
  contextId?: string,
) {
  const database = getDatabase();
  const { end, start, today } = currentMonthInterval(referenceDate);
  const [editors, debts] = await Promise.all([
    database.editor.findMany({
      where: { workspaceId, active: true },
      select: { id: true, displayName: true },
      orderBy: { createdAt: "asc" },
    }),
    database.debt.findMany({
      where: { workspaceId, ...(contextId ? { contextId } : {}) },
      include: {
        category: true,
        installments: {
          include: { shares: { include: { editor: true } } },
          orderBy: { number: "asc" },
        },
      },
      orderBy: [{ canceledAt: "asc" }, { purchaseDate: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const activeDebts = debts.filter(({ canceledAt }) => !canceledAt);
  const pendingInstallments = activeDebts.flatMap(({ installments }) =>
    installments.filter(({ status }) => status === "PENDING"),
  );
  const monthInstallments = activeDebts.flatMap(({ installments }) =>
    installments.filter(
      ({ dueDate, status }) => status !== "CANCELED" && dueDate >= start && dueDate < end,
    ),
  );
  const pendingThisMonthInstallments = monthInstallments.filter(({ status }) => status === "PENDING");
  const paidThisMonthInstallments = monthInstallments.filter(({ status }) => status === "PAID");
  const overdueInstallments = pendingInstallments.filter(({ dueDate }) => dueDate < today);
  const outstandingByEditor = new Map(editors.map(({ id }) => [id, money(0)]));
  const dueThisMonthByEditor = new Map(editors.map(({ id }) => [id, money(0)]));

  for (const installment of pendingInstallments) {
    for (const share of installment.shares) {
      outstandingByEditor.set(
        share.editorId,
        money((outstandingByEditor.get(share.editorId) ?? money(0)).plus(share.amount)),
      );
    }
  }

  for (const installment of monthInstallments) {
    for (const share of installment.shares) {
      dueThisMonthByEditor.set(
        share.editorId,
        money((dueThisMonthByEditor.get(share.editorId) ?? money(0)).plus(share.amount)),
      );
    }
  }

  return {
    coupleOutstanding: sumMoney(pendingInstallments.map(({ amount }) => amount)),
    debts: debts.map((debt) => {
      const pending = debt.installments.filter(({ status }) => status === "PENDING");
      const paid = debt.installments.filter(({ status }) => status === "PAID");
      const debtMonthInstallments = debt.installments.filter(
        ({ dueDate, status }) => status !== "CANCELED" && dueDate >= start && dueDate < end,
      );
      const debtOverdueInstallments = pending.filter(({ dueDate }) => dueDate < today);
      const originalByEditor = new Map<string, ReturnType<typeof money>>();
      const outstandingDebtByEditor = new Map<string, ReturnType<typeof money>>();

      for (const installment of debt.installments) {
        for (const share of installment.shares) {
          originalByEditor.set(
            share.editorId,
            money((originalByEditor.get(share.editorId) ?? money(0)).plus(share.amount)),
          );

          if (installment.status === "PENDING") {
            outstandingDebtByEditor.set(
              share.editorId,
              money((outstandingDebtByEditor.get(share.editorId) ?? money(0)).plus(share.amount)),
            );
          }
        }
      }

      return {
        ...debt,
        monthInstallments: debtMonthInstallments,
        nextInstallment: pending[0] ?? null,
        originalByEditor,
        overdueInstallments: debtOverdueInstallments,
        outstanding: sumMoney(pending.map(({ amount }) => amount)),
        outstandingByEditor: outstandingDebtByEditor,
        paidAmount: sumMoney(paid.map(({ amount }) => amount)),
        paidCount: paid.length,
      };
    }),
    dueThisMonth: sumMoney(monthInstallments.map(({ amount }) => amount)),
    month: start,
    paidThisMonth: sumMoney(paidThisMonthInstallments.map(({ amount }) => amount)),
    pendingThisMonth: sumMoney(pendingThisMonthInstallments.map(({ amount }) => amount)),
    editors: editors.map((editor) => ({
      ...editor,
      dueThisMonth: dueThisMonthByEditor.get(editor.id) ?? money(0),
      outstanding: outstandingByEditor.get(editor.id) ?? money(0),
    })),
    overdue: sumMoney(overdueInstallments.map(({ amount }) => amount)),
  };
}
