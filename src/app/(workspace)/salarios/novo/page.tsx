import { SalaryForm } from "@/components/salary-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getSalaryPrerequisiteState } from "@/modules/salaries/domain/salary-prerequisites";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { createSalaryAction } from "@/modules/salaries/application/salary-actions";
import { monthInputInTimeZone } from "@/modules/shared/domain/calendar";

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
  const prerequisiteState = getSalaryPrerequisiteState({
    activeAccountCount: accounts.length,
    activeIncomeCategoryCount: categories.length,
  });

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Receita recorrente</p>
          <h1>Novo salário</h1>
          <p>Cadastre um recebimento mensal ou quinzenal para uma das pessoas.</p>
        </div>
      </section>

      {prerequisiteState === "missing-account-and-income-category" ? (
        <EmptyState
          action={{ href: "/contas/nova", label: "Criar conta" }}
          description="Cadastre uma conta ativa e uma categoria de receita antes de continuar."
          icon="income"
          secondaryAction={{ href: "/categorias/nova", label: "Criar categoria" }}
          title="Conta e categoria necessárias"
        />
      ) : prerequisiteState === "missing-account" ? (
        <EmptyState
          action={{ href: "/contas/nova", label: "Criar conta" }}
          description="Cadastre ou reative uma conta antes de cadastrar um salário."
          icon="account"
          title="Conta ativa necessária"
        />
      ) : prerequisiteState === "missing-income-category" ? (
        <EmptyState
          action={{ href: "/categorias/nova", label: "Criar categoria" }}
          description="Cadastre uma categoria de receita ativa antes de cadastrar um salário."
          icon="category"
          title="Categoria de receita necessária"
        />
      ) : (
        <SalaryForm
          accounts={accounts}
          action={createSalaryAction}
          categories={categories}
          currentMonth={monthInputInTimeZone(new Date(), access.workspaceTimezone)}
          currentEditorId={access.editorId}
          editors={editors}
        />
      )}
    </>
  );
}
