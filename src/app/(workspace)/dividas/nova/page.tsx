import Link from "next/link";

import { DebtForm } from "@/components/debt-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createDebtAction } from "@/modules/debts/application/debt-actions";

export default async function NewDebtPage() {
  const access = await requireCurrentAccess();
  const database = getDatabase();
  const [accounts, categories, editors] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId: access.workspaceId, active: true, type: { not: "INVESTMENT" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: { workspaceId: access.workspaceId, active: true, kind: "EXPENSE" },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.editor.findMany({
      where: { workspaceId: access.workspaceId, active: true },
      select: { id: true, displayName: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Casal</p>
          <h1>Nova dívida</h1>
          <p>Divida a responsabilidade entre uma ou duas pessoas e gere todas as parcelas.</p>
        </div>
      </section>

      {categories.length === 0 ? (
        <section className="empty-state">
          <h2>Crie uma categoria de despesa</h2>
          <p>A dívida precisa de uma categoria para aparecer corretamente nos relatórios.</p>
          <Link className="primary-button" href="/categorias/nova">
            Criar categoria
          </Link>
        </section>
      ) : (
        <DebtForm
          accounts={accounts}
          action={createDebtAction}
          categories={categories}
          currentEditorId={access.editorId}
          editors={editors}
        />
      )}
    </>
  );
}
