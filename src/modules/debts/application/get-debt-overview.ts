import { getDatabase } from "@/lib/db";
import { money, sumMoney } from "@/modules/shared/domain/money";

function currentMonthInterval() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return { end, start, today };
}

export async function getDebtOverview(workspaceId: string) {
  const database = getDatabase();
  const { end, start, today } = currentMonthInterval();
  const [editors, debts] = await Promise.all([
    database.editor.findMany({
      where: { workspaceId, active: true },
      select: { id: true, displayName: true },
      orderBy: { createdAt: "asc" },
    }),
    database.debt.findMany({
      where: { workspaceId },
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
  const dueThisMonthInstallments = pendingInstallments.filter(
    ({ dueDate }) => dueDate >= start && dueDate < end,
  );
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

  for (const installment of dueThisMonthInstallments) {
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
        nextInstallment: pending[0] ?? null,
        originalByEditor,
        outstanding: sumMoney(pending.map(({ amount }) => amount)),
        outstandingByEditor: outstandingDebtByEditor,
        paidAmount: sumMoney(paid.map(({ amount }) => amount)),
        paidCount: paid.length,
      };
    }),
    dueThisMonth: sumMoney(dueThisMonthInstallments.map(({ amount }) => amount)),
    editors: editors.map((editor) => ({
      ...editor,
      dueThisMonth: dueThisMonthByEditor.get(editor.id) ?? money(0),
      outstanding: outstandingByEditor.get(editor.id) ?? money(0),
    })),
    overdue: sumMoney(
      pendingInstallments.filter(({ dueDate }) => dueDate < today).map(({ amount }) => amount),
    ),
  };
}
