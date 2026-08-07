import Link from "next/link";

import { FixedExpenseForm } from "@/components/fixed-expense-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createFixedExpenseAction } from "@/modules/fixed-expenses/application/fixed-expense-actions";
import { monthInputInTimeZone } from "@/modules/shared/domain/calendar";

export default async function NewFixedExpensePage() {
  const access = await requireCurrentAccess();
  const database = getDatabase();
  const [accounts, categories, editors] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId: access.workspaceId, active: true },
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
          <p className="eyebrow">Recorrência mensal</p>
          <h1>Nova despesa fixa</h1>
          <p>Cadastre um compromisso mensal e acompanhe o pagamento no painel.</p>
        </div>
      </section>

      {accounts.length === 0 || categories.length === 0 ? (
        <section className="empty-state">
          <h2>Conta e categoria necessárias</h2>
          <p>Cadastre uma conta e uma categoria de despesa antes de continuar.</p>
          <div className="empty-state-actions">
            <Link className="primary-button" href="/contas/nova">Criar conta</Link>
            <Link className="secondary-button" href="/categorias/nova">Criar categoria</Link>
          </div>
        </section>
      ) : (
        <FixedExpenseForm
          accounts={accounts}
          action={createFixedExpenseAction}
          categories={categories}
          currentMonth={monthInputInTimeZone(new Date(), access.workspaceTimezone)}
          currentEditorId={access.editorId}
          editors={editors}
        />
      )}
    </>
  );
}
