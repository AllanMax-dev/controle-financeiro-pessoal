import { BudgetForm } from "@/components/budget-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { getDatabase } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  contextHref,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { saveBudgetAction } from "@/modules/planning/application/budget-actions";
import {
  budgetUsageLabel,
  calculateBudgetUsage,
} from "@/modules/planning/domain/budget-usage";
import { monthInputInTimeZone } from "@/modules/shared/domain/calendar";
import { money, sumMoney } from "@/modules/shared/domain/money";

function monthInterval(month: string, fallbackMonth: string) {
  const safeMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : fallbackMonth;
  const start = new Date(`${safeMonth}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { end, month: safeMonth, start };
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams & { month?: string }>;
}) {
  const access = await requireCurrentAccess();
  const filters = await searchParams;
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(filters),
  );
  const currentContext = contextState.current;
  const defaultMonth = monthInputInTimeZone(new Date(), access.workspaceTimezone);
  const { end, month, start } = monthInterval(filters.month ?? defaultMonth, defaultMonth);
  const database = getDatabase();
  await synchronizeDueFixedExpenses(access.workspaceId, new Date(), currentContext.id);
  const [categories, budgets, realizedGroups] = await Promise.all([
    database.category.findMany({
      where: {
        contextId: currentContext.id,
        workspaceId: access.workspaceId,
        kind: "EXPENSE",
        OR: [
          { active: true },
          { budgets: { some: { contextId: currentContext.id, month: start } } },
          {
            transactions: {
              some: {
                type: "EXPENSE",
                contextId: currentContext.id,
                status: "SETTLED",
                competenceDate: { gte: start, lt: end },
                account: { type: { not: "INVESTMENT" } },
              },
            },
          },
        ],
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    }),
    database.budget.findMany({
      where: {
        contextId: currentContext.id,
        workspaceId: access.workspaceId,
        month: start,
        category: { kind: "EXPENSE" },
      },
    }),
    database.transaction.groupBy({
      by: ["categoryId"],
      where: {
        contextId: currentContext.id,
        workspaceId: access.workspaceId,
        type: "EXPENSE",
        status: "SETTLED",
        competenceDate: { gte: start, lt: end },
        category: { kind: "EXPENSE" },
        account: { type: { not: "INVESTMENT" } },
      },
      _sum: { amount: true },
    }),
  ]);
  const budgetsByCategory = new Map(budgets.map((budget) => [budget.categoryId, budget]));
  const realizedByCategory = new Map(
    realizedGroups.map((group) => [group.categoryId, group._sum.amount ?? money(0)]),
  );
  const totalPlanned = sumMoney(budgets.map(({ amount }) => amount));
  const totalRealized = sumMoney(realizedGroups.map(({ _sum }) => _sum.amount ?? money(0)));
  const totalUsage = calculateBudgetUsage(totalPlanned, totalRealized);
  const configuredBudgetCount = budgets.filter(({ amount }) => money(amount).greaterThan(0)).length;
  const totalProgressLabel = totalUsage.percentage
    ? `${totalUsage.percentage.toFixed(0)}% utilizado`
    : totalRealized.greaterThan(0)
      ? "Gastos sem limite definido"
      : "Aguardando limites e despesas";
  const totalStatusTitle = {
    empty: "Comece definindo seus limites",
    "on-track": "Orçamento sob controle",
    over: "Orçamento do mês excedido",
    unplanned: "Há gastos sem planejamento",
    warning: "Orçamento próximo do limite",
  }[totalUsage.status];
  const totalNeedsAttention = totalUsage.status === "over" || totalUsage.status === "unplanned";

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Orçamento</p>
          <h1>Planejamento mensal</h1>
          <p>Defina limites por categoria e acompanhe somente despesas realizadas no mês.</p>
        </div>
        <form className="month-picker" method="get">
          <input name="contextId" type="hidden" value={currentContext.id} />
          <label>
            <span>Mês</span>
            <input name="month" type="month" defaultValue={month} />
          </label>
          <button className="secondary-button" type="submit">
            Exibir
          </button>
        </form>
      </section>

      <section
        className={`panel-card planning-summary planning-summary-${totalUsage.status}`}
        aria-label="Resumo do planejamento"
      >
        <div className="planning-summary-heading">
          <span className="metric-icon metric-icon-primary">
            <Icon name="planning" />
          </span>
          <div>
            <p className="eyebrow">Visão do mês</p>
            <h2>{totalStatusTitle}</h2>
            <p>
              {configuredBudgetCount} de {categories.length} categorias com limite definido
            </p>
          </div>
          <span className={`planning-status planning-status-${totalUsage.status}`}>
            {budgetUsageLabel(totalUsage.status)}
          </span>
        </div>

        <div className="planning-summary-values">
          <div className="planning-summary-primary">
            <span>
              {totalUsage.status === "over"
                ? "Acima do limite"
                : totalUsage.status === "unplanned"
                  ? "Utilizado sem limite"
                  : "Disponível"}
            </span>
            <strong className={totalNeedsAttention ? "value-expense" : "value-income"}>
              {formatCurrency(totalUsage.remaining.abs())}
            </strong>
          </div>
          <div>
            <span>Planejado</span>
            <strong>{formatCurrency(totalPlanned)}</strong>
          </div>
          <div>
            <span>Utilizado</span>
            <strong>{formatCurrency(totalRealized)}</strong>
          </div>
        </div>

        <div className="planning-summary-progress">
          <div>
            <span>Uso do orçamento</span>
            <strong>{totalProgressLabel}</strong>
          </div>
          <div
            className="progress-track progress-track-large"
            aria-label={totalProgressLabel}
          >
            <span style={{ width: `${totalUsage.progress}%` }} />
          </div>
        </div>
      </section>

      {categories.length === 0 ? (
        <EmptyState
          action={{ href: contextHref("/categorias/nova", currentContext.id), label: "Criar categoria" }}
          description="Crie uma categoria de despesa antes de definir o planejamento mensal."
          icon="planning"
          title="Nenhuma categoria de despesa ativa"
        />
      ) : (
        <>
          <div className="planning-list-heading">
            <div>
              <p className="eyebrow">Categorias</p>
              <h2>Limites do mês</h2>
              <p>Abra uma categoria somente quando precisar definir ou ajustar o limite.</p>
            </div>
            <span>{categories.length} categorias</span>
          </div>

          <section className="planning-list" aria-label="Orçamentos por categoria">
            {categories.map((category) => {
              const budget = budgetsByCategory.get(category.id);
              const planned = budget?.amount ?? money(0);
              const realized = realizedByCategory.get(category.id) ?? money(0);
              const usage = calculateBudgetUsage(planned, realized);
              const usageDescription = usage.percentage
                ? `${usage.percentage.toFixed(0)}% utilizado`
                : realized.greaterThan(0)
                  ? "Sem limite definido"
                  : "Nenhum gasto no mês";

              return (
                <article
                  className={`planning-budget-card planning-budget-${usage.status}`}
                  key={category.id}
                >
                  <header className="planning-budget-heading">
                    <div className="planning-category">
                      <span
                        className="entity-color"
                        style={{ backgroundColor: category.color ?? "#256b4b" }}
                      />
                      <div>
                        <strong>{category.name}</strong>
                        <span className={`planning-status planning-status-${usage.status}`}>
                          {budgetUsageLabel(usage.status)}
                        </span>
                      </div>
                    </div>
                    <div className="planning-balance">
                      <span>
                        {usage.status === "over"
                          ? "Excedido"
                          : usage.hasLimit
                            ? "Disponível"
                            : "Utilizado"}
                      </span>
                      <strong
                        className={
                          usage.status === "over" || usage.status === "unplanned"
                            ? "value-expense"
                            : ""
                        }
                      >
                        {formatCurrency(
                          usage.hasLimit ? usage.remaining.abs() : usage.realized,
                        )}
                      </strong>
                    </div>
                  </header>

                  <div
                    className="progress-track"
                    aria-label={`${category.name}: ${usageDescription}`}
                  >
                    <span style={{ width: `${usage.progress}%` }} />
                  </div>

                  <div className="planning-budget-meta">
                    <span>
                      Utilizado <strong>{formatCurrency(realized)}</strong>
                    </span>
                    <span>
                      Limite <strong>{usage.hasLimit ? formatCurrency(planned) : "Não definido"}</strong>
                    </span>
                    <span>{usageDescription}</span>
                  </div>

                  {category.active ? (
                    <details className="budget-editor">
                      <summary>
                        <Icon name="edit" />
                        {usage.hasLimit ? "Ajustar limite" : "Definir limite"}
                      </summary>
                      <BudgetForm
                        action={saveBudgetAction}
                        amount={planned.toFixed(2).replace(".", ",")}
                        budgetId={budget?.id}
                        categoryId={category.id}
                        categoryName={category.name}
                        contextId={currentContext.id}
                        key={`${category.id}-${month}`}
                        month={month}
                        version={budget?.version}
                      />
                    </details>
                  ) : (
                    <p className="planning-archived-note">
                      Categoria arquivada; os valores históricos continuam no resumo.
                    </p>
                  )}
                </article>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
