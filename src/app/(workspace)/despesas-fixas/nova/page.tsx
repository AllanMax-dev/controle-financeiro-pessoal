import { FixedExpenseForm } from "@/components/fixed-expense-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getDatabase } from "@/lib/db";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  contextHref,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import { createFixedExpenseAction } from "@/modules/fixed-expenses/application/fixed-expense-actions";
import { monthInputInTimeZone } from "@/modules/shared/domain/calendar";

export default async function NewFixedExpensePage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(await searchParams),
  );
  const database = getDatabase();
  const [accounts, categories, editors] = await Promise.all([
    database.financialAccount.findMany({
      where: {
        contextId: contextState.current.id,
        workspaceId: access.workspaceId,
        active: true,
        type: { not: "INVESTMENT" },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: {
        contextId: contextState.current.id,
        workspaceId: access.workspaceId,
        active: true,
        kind: "EXPENSE",
      },
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
          action={{ href: contextHref("/contas/nova", contextState.current.id), label: "Criar conta" }}
          description="Cadastre uma conta ativa e uma categoria de despesa antes de continuar."
          icon="calendar"
          secondaryAction={{ href: contextHref("/categorias/nova", contextState.current.id), label: "Criar categoria" }}
          title="Conta e categoria necessárias"
        />
      ) : missingAccount ? (
        <EmptyState
          action={{ href: contextHref("/contas/nova", contextState.current.id), label: "Criar conta" }}
          description="Cadastre ou reative uma conta antes de criar uma despesa fixa."
          icon="account"
          title="Conta ativa necessária"
        />
      ) : missingExpenseCategory ? (
        <EmptyState
          action={{ href: contextHref("/categorias/nova", contextState.current.id), label: "Criar categoria" }}
          description="Cadastre uma categoria de despesa ativa antes de criar uma despesa fixa."
          icon="category"
          title="Categoria de despesa necessária"
        />
      ) : (
        <FixedExpenseForm
          accounts={accounts}
          action={createFixedExpenseAction}
          categories={categories}
          contextId={contextState.current.id}
          currentMonth={monthInputInTimeZone(new Date(), access.workspaceTimezone)}
          currentEditorId={access.editorId}
          editors={editors}
        />
      )}
    </>
  );
}
