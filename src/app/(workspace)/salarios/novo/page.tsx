import Link from "next/link";

import { SalaryForm } from "@/components/salary-form";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createSalaryAction } from "@/modules/salaries/application/salary-actions";

export default async function NewSalaryPage() {
  const access = await requireCurrentAccess();
  const database = getDatabase();
  const [accounts, categories, editors] = await Promise.all([
    database.financialAccount.findMany({
      where: { workspaceId: access.workspaceId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: { workspaceId: access.workspaceId, active: true, kind: "INCOME" },
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
          <p className="eyebrow">Receita recorrente</p>
          <h1>Novo salário</h1>
          <p>Cadastre um recebimento mensal ou quinzenal para uma das pessoas.</p>
        </div>
      </section>

      {accounts.length === 0 || categories.length === 0 ? (
        <section className="empty-state">
          <h2>Conta e categoria necessárias</h2>
          <p>Cadastre uma conta e uma categoria de receita antes de continuar.</p>
          <div className="empty-state-actions">
            <Link className="primary-button" href="/contas/nova">Criar conta</Link>
            <Link className="secondary-button" href="/categorias/nova">Criar categoria</Link>
          </div>
        </section>
      ) : (
        <SalaryForm
          accounts={accounts}
          action={createSalaryAction}
          categories={categories}
          currentEditorId={access.editorId}
          editors={editors}
        />
      )}
    </>
  );
}
