import { FixedExpenseForm } from "@/components/fixed-expense-form";
import { EmptyState } from "@/components/ui/empty-state";
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
  const missingAccount = accounts.length === 0;
  const missingExpenseCategory = categories.length === 0;

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Recorrência mensal</p>
          <h1>Nova despesa fixa</h1>
          <p>Cadastre um compromisso mensal e acompanhe o pagamento no painel.</p>
        </div>
      </section>

      {missingAccount && missingExpenseCategory ? (
        <EmptyState
          action={{ href: "/contas/nova", label: "Criar conta" }}
          description="Cadastre uma conta ativa e uma categoria de despesa antes de continuar."
          icon="calendar"
          secondaryAction={{ href: "/categorias/nova", label: "Criar categoria" }}
          title="Conta e categoria necessárias"
        />
      ) : missingAccount ? (
        <EmptyState
          action={{ href: "/contas/nova", label: "Criar conta" }}
          description="Cadastre ou reative uma conta antes de criar uma despesa fixa."
          icon="account"
          title="Conta ativa necessária"
        />
      ) : missingExpenseCategory ? (
        <EmptyState
          action={{ href: "/categorias/nova", label: "Criar categoria" }}
          description="Cadastre uma categoria de despesa ativa antes de criar uma despesa fixa."
          icon="category"
          title="Categoria de despesa necessária"
        />
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
