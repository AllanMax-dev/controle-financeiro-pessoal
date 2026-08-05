import Link from "next/link";

import { TransactionForm } from "@/components/transaction-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createTransactionAction } from "@/modules/transactions/application/transaction-actions";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function NewTransactionPage() {
  const access = await requireCurrentAccess();
  const database = getDatabase();
  const [accounts, categories] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId: access.workspaceId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: { workspaceId: access.workspaceId, active: true },
      select: { id: true, kind: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Lançamentos</p>
          <h1>Novo lançamento</h1>
          <p>Valores pendentes não alteram o saldo atual até serem realizados.</p>
        </div>
      </section>
      {accounts.length === 0 ? (
        <section className="empty-state">
          <h2>Crie uma conta primeiro</h2>
          <p>Todo lançamento precisa estar associado a uma conta financeira ativa.</p>
          <Link className="primary-button" href="/contas/nova">
            Criar conta
          </Link>
        </section>
      ) : (
        <TransactionForm
          accounts={accounts}
          action={createTransactionAction}
          categories={categories}
          defaults={{
            accountId: accounts[0]?.id ?? "",
            amount: "",
            categoryId: "",
            competenceDate: today(),
            description: "",
            dueDate: today(),
            notes: "",
            settledDate: today(),
            status: "PENDING",
            type: "EXPENSE",
          }}
          submitLabel="Criar lançamento"
        />
      )}
    </>
  );
}
