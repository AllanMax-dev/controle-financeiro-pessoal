import Link from "next/link";

import { TransactionForm } from "@/components/transaction-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  contextHref,
  resolveFinancialContext,
  financialContextWhere,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import { dateInputInTimeZone } from "@/modules/shared/domain/calendar";
import { createTransactionAction } from "@/modules/transactions/application/transaction-actions";

export default async function VariableExpensesPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(await searchParams),
  );
  const currentContext = contextState.current;
  const database = getDatabase();
  const writeContext = contextState.scope.writeContext;
  const today = dateInputInTimeZone(new Date(), access.workspaceTimezone);
  const [accounts, categories, expenses] = await Promise.all([
    database.financialAccount.findMany({
      where: {
        active: true,
        contextId: writeContext.id,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: {
        active: true,
        contextId: writeContext.id,
        kind: "EXPENSE",
        workspaceId: access.workspaceId,
      },
      select: { id: true, kind: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.transaction.findMany({
      where: {
        ...financialContextWhere(contextState.scope),
        fixedExpenseId: null,
        type: "EXPENSE",
        workspaceId: access.workspaceId,
      },
      include: { account: true, category: true, financialContext: { select: { name: true } } },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
  ]);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Gastos variáveis</p>
          <h1>Despesas avulsas</h1>
          <p>Registre compras do dia a dia separadas dos gastos fixos e das faturas.</p>
        </div>
      </section>

      <section className="finance-workspace-grid">
        <div className="finance-form-stack">
          {accounts.length === 0 ? (
            <EmptyState
              action={{ href: contextHref("/contas/nova", currentContext.id), label: "Criar conta" }}
              description="Crie uma conta operacional para registrar gastos variáveis."
              icon="account"
              title="Conta necessária"
            />
          ) : (
            <>
              <TransactionForm
                accounts={accounts}
                action={createTransactionAction}
                cancelHref={contextHref("/gastos-variaveis", currentContext.id)}
                categories={categories}
                defaults={{
                  accountId: accounts[0]?.id ?? "",
                  amount: "",
                  categoryId: "",
                  competenceDate: today,
                  contextId: writeContext.id,
                  description: "",
                  dueDate: today,
                  notes: "",
                  settledDate: today,
                  status: "SETTLED",
                  type: "EXPENSE",
                }}
                lockedType
                submitLabel="Adicionar lançamento"
              />
              <Link className="secondary-button" href={contextHref("/categorias/nova", currentContext.id)}>
                <Icon name="add" />
                Nova categoria
              </Link>
            </>
          )}
        </div>

        <section className="panel-card finance-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Histórico</p>
              <h2>Últimos gastos</h2>
            </div>
            <Link className="text-button" href={contextHref("/lancamentos", currentContext.id)}>
              Ver todos
            </Link>
          </div>
          {expenses.length === 0 ? (
            <EmptyState
              description="Os gastos variáveis aparecerão aqui depois do primeiro registro."
              icon="expense"
              title="Nenhum gasto variável"
            />
          ) : (
            <ul className="compact-finance-list">
              {expenses.map((expense) => (
                <li key={expense.id}>
                  <span>
                    <strong>{expense.description}</strong>
                    <small>{expense.financialContext.name}</small>
                    <small>
                      {expense.account.name} · {expense.category?.name ?? "Sem categoria"} · {formatDate(expense.competenceDate)}
                    </small>
                  </span>
                  <strong className="value-expense">{formatCurrency(expense.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </>
  );
}
