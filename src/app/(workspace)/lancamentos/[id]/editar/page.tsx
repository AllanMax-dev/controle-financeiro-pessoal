import { notFound } from "next/navigation";

import { TransactionForm } from "@/components/transaction-form";
import { getDatabase } from "@/lib/db";
import { toDateInputValue } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { updateTransactionAction } from "@/modules/transactions/application/transaction-actions";

export default async function EditTransactionPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await requireCurrentAccess();
  const { id } = await params;
  const database = getDatabase();
  const transaction = await database.transaction.findFirst({
    where: {
      id,
      workspaceId: access.workspaceId,
      status: { not: "CANCELED" },
      debtInstallment: { is: null },
      salary: { is: null },
    },
  });

  if (!transaction) {
    notFound();
  }

  const [accounts, categories] = await Promise.all([
    database.financialAccount.findMany({
      where: {
        workspaceId: access.workspaceId,
        OR: [{ active: true }, { id: transaction.accountId }],
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: {
        workspaceId: access.workspaceId,
        OR: [{ active: true }, ...(transaction.categoryId ? [{ id: transaction.categoryId }] : [])],
      },
      select: { id: true, kind: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Lançamentos</p>
          <h1>Editar lançamento</h1>
          <p>
            {transaction.fixedExpenseId
              ? "A alteração vale somente para esta baixa mensal; a recorrência permanece inalterada."
              : "O saldo e os indicadores serão recalculados após o salvamento."}
          </p>
        </div>
      </section>
      <TransactionForm
        accounts={accounts}
        action={updateTransactionAction}
        categories={categories}
        defaults={{
          accountId: transaction.accountId,
          amount: transaction.amount.toFixed(2).replace(".", ","),
          categoryId: transaction.categoryId ?? "",
          competenceDate: toDateInputValue(transaction.competenceDate),
          description: transaction.description,
          dueDate: transaction.dueDate ? toDateInputValue(transaction.dueDate) : "",
          id: transaction.id,
          notes: transaction.notes ?? "",
          settledDate: transaction.settledAt ? toDateInputValue(transaction.settledAt) : "",
          status: transaction.status === "SETTLED" ? "SETTLED" : "PENDING",
          type: transaction.type,
          version: transaction.version,
        }}
        lockedType={Boolean(transaction.fixedExpenseId)}
        submitLabel="Salvar alterações"
      />
    </>
  );
}
