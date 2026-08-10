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
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import { getSalaryOverview } from "@/modules/salaries/application/get-salary-overview";
import { dateInputInTimeZone } from "@/modules/shared/domain/calendar";
import { createTransactionAction } from "@/modules/transactions/application/transaction-actions";

export default async function ReceiptsPage({
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
  const today = dateInputInTimeZone(new Date(), access.workspaceTimezone);
  const [accounts, categories, incomes, salaryOverview] = await Promise.all([
    database.financialAccount.findMany({
      where: {
        active: true,
        contextId: currentContext.id,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: {
        active: true,
        contextId: currentContext.id,
        kind: "INCOME",
        workspaceId: access.workspaceId,
      },
      select: { id: true, kind: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.transaction.findMany({
      where: {
        contextId: currentContext.id,
        salaryId: null,
        type: "INCOME",
        workspaceId: access.workspaceId,
      },
      include: { account: true, category: true },
      orderBy: [{ competenceDate: "desc" }, { createdAt: "desc" }],
      take: 50,
    }),
    getSalaryOverview(access.workspaceId, new Date(), currentContext.id),
  ]);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Recebimentos</p>
          <h1>Entradas do mÃªs</h1>
          <p>Registre receitas avulsas e acompanhe salÃ¡rios recorrentes em um sÃ³ lugar.</p>
        </div>
        <Link className="secondary-button" href={contextHref("/salarios/novo", currentContext.id)}>
          <Icon name="add" />
          SalÃ¡rio recorrente
        </Link>
      </section>

      <section className="finance-workspace-grid">
        <div className="finance-form-stack">
          {accounts.length === 0 ? (
            <EmptyState
              action={{ href: contextHref("/contas/nova", currentContext.id), label: "Criar conta" }}
              description="Crie uma conta operacional para registrar recebimentos."
              icon="account"
              title="Conta necessÃ¡ria"
            />
          ) : (
            <>
              <TransactionForm
                accounts={accounts}
                action={createTransactionAction}
                cancelHref={contextHref("/recebimentos", currentContext.id)}
                categories={categories}
                defaults={{
                  accountId: accounts[0]?.id ?? "",
                  amount: "",
                  categoryId: "",
                  competenceDate: today,
                  contextId: currentContext.id,
                  description: "",
                  dueDate: today,
                  notes: "",
                  settledDate: today,
                  status: "SETTLED",
                  type: "INCOME",
                }}
                lockedType
                submitLabel="Registrar recebimento"
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
              <p className="eyebrow">SalÃ¡rios</p>
              <h2>RecorrÃªncias e recebidos</h2>
            </div>
            <Link className="text-button" href={contextHref("/salarios", currentContext.id)}>
              Ver salÃ¡rios
            </Link>
          </div>
          <div className="fixed-expense-dashboard-summary">
            <div>
              <span>Previsto</span>
              <strong>{formatCurrency(salaryOverview.expected)}</strong>
            </div>
            <div>
              <span>Recebido</span>
              <strong className="value-income">{formatCurrency(salaryOverview.received)}</strong>
            </div>
            <div>
              <span>A receber</span>
              <strong>{formatCurrency(salaryOverview.pending)}</strong>
            </div>
          </div>

          <div className="panel-heading panel-heading-inline">
            <div>
              <p className="eyebrow">Avulsos</p>
              <h2>Ãšltimos recebimentos</h2>
            </div>
            <Link className="text-button" href={contextHref("/lancamentos", currentContext.id)}>
              Ver todos
            </Link>
          </div>
          {incomes.length === 0 ? (
            <EmptyState
              description="Os recebimentos avulsos aparecerÃ£o aqui depois do primeiro registro."
              icon="income"
              title="Nenhum recebimento avulso"
            />
          ) : (
            <ul className="compact-finance-list">
              {incomes.map((income) => (
                <li key={income.id}>
                  <span>
                    <strong>{income.description}</strong>
                    <small>
                      {income.account.name} Â· {income.category?.name ?? "Sem categoria"} Â· {formatDate(income.competenceDate)}
                    </small>
                  </span>
                  <strong className="value-income">{formatCurrency(income.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </section>
      </section>
    </>
  );
}
