import { notFound } from "next/navigation";

import { FixedExpenseForm } from "@/components/fixed-expense-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { updateFixedExpenseAction } from "@/modules/fixed-expenses/application/fixed-expense-actions";

export default async function EditFixedExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const access = await requireCurrentAccess();
  const { id } = await params;
  const database = getDatabase();
  const fixedExpense = await database.fixedExpense.findFirst({
    where: { active: true, id, workspaceId: access.workspaceId },
  });

  if (!fixedExpense) {
    notFound();
  }

  const [accounts, categories, editors] = await Promise.all([
    database.financialAccount.findMany({
      where: {
        workspaceId: access.workspaceId,
        OR: [
          { active: true, type: { not: "INVESTMENT" } },
          { id: fixedExpense.accountId },
        ],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: {
        workspaceId: access.workspaceId,
        kind: "EXPENSE",
        OR: [{ active: true }, { id: fixedExpense.categoryId }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.editor.findMany({
      where: {
        workspaceId: access.workspaceId,
        OR: [{ active: true }, { id: fixedExpense.editorId }],
      },
      select: { id: true, displayName: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Recorrência mensal</p>
          <h1>Editar despesa fixa</h1>
          <p>As mudanças serão aplicadas aos próximos vencimentos; os pagamentos anteriores serão preservados.</p>
        </div>
      </section>

      <FixedExpenseForm
        accounts={accounts}
        action={updateFixedExpenseAction}
        categories={categories}
        currentMonth={fixedExpense.startMonth.toISOString().slice(0, 7)}
        currentEditorId={access.editorId}
        defaults={{
          accountId: fixedExpense.accountId,
          amount: fixedExpense.amount.toFixed(2).replace(".", ","),
          categoryId: fixedExpense.categoryId,
          description: fixedExpense.description,
          dueDay: fixedExpense.dueDay,
          editorId: fixedExpense.editorId,
          id: fixedExpense.id,
          notes: fixedExpense.notes ?? "",
          startMonth: fixedExpense.startMonth.toISOString().slice(0, 7),
          version: fixedExpense.version,
        }}
        editors={editors}
        submitLabel="Salvar alterações"
      />
    </>
  );
}
