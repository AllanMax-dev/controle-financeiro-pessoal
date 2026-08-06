import Decimal from "decimal.js";

import { BudgetForm } from "@/components/budget-form";
import { EmptyState } from "@/components/ui/empty-state";
import { getDatabase } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { synchronizeDueFixedExpenses } from "@/modules/fixed-expenses/application/synchronize-due-fixed-expenses";
import { saveBudgetAction } from "@/modules/planning/application/budget-actions";
import { money, sumMoney } from "@/modules/shared/domain/money";

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function monthInterval(month: string) {
  const safeMonth = /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : currentMonth();
  const start = new Date(`${safeMonth}-01T00:00:00.000Z`);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { end, month: safeMonth, start };
}

export default async function PlanningPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const access = await requireCurrentAccess();
  const filters = await searchParams;
  const { end, month, start } = monthInterval(filters.month ?? currentMonth());
  const database = getDatabase();
  await synchronizeDueFixedExpenses(access.workspaceId);
  const [categories, budgets, realizedGroups] = await Promise.all([
    database.category.findMany({
      where: { workspaceId: access.workspaceId, kind: "EXPENSE", active: true },
      orderBy: { name: "asc" },
    }),
    database.budget.findMany({
      where: { workspaceId: access.workspaceId, month: start },
    }),
    database.transaction.groupBy({
      by: ["categoryId"],
      where: {
        workspaceId: access.workspaceId,
        type: "EXPENSE",
        status: "SETTLED",
        competenceDate: { gte: start, lt: end },
        categoryId: { not: null },
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
  const totalRemaining = money(totalPlanned.minus(totalRealized));
  const totalProgress = totalPlanned.greaterThan(0)
    ? Decimal.min(totalRealized.dividedBy(totalPlanned).times(100), 100).toNumber()
    : 0;
  const totalProgressLabel = totalPlanned.greaterThan(0)
    ? totalRealized.dividedBy(totalPlanned).times(100).toFixed(0)
    : "0";

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Orçamento</p>
          <h1>Planejamento mensal</h1>
          <p>Defina limites por categoria e acompanhe somente despesas realizadas no mês.</p>
        </div>
        <form className="month-picker" method="get">
          <label>
            <span>Mês</span>
            <input name="month" type="month" defaultValue={month} />
          </label>
          <button className="secondary-button" type="submit">
            Exibir
          </button>
        </form>
      </section>

      <section className="metric-grid planning-metrics" aria-label="Resumo do planejamento">
        <article className="metric-card">
          <span>Planejado</span>
          <strong>{formatCurrency(totalPlanned)}</strong>
          <small>Soma dos orçamentos por categoria</small>
        </article>
        <article className="metric-card">
          <span>Realizado</span>
          <strong>{formatCurrency(totalRealized)}</strong>
          <small>Despesas realizadas no mês</small>
        </article>
        <article className="metric-card">
          <span>Restante</span>
          <strong className={totalRemaining.isNegative() ? "value-expense" : "value-income"}>
            {formatCurrency(totalRemaining)}
          </strong>
          <small>Planejado menos realizado</small>
        </article>
      </section>

      <section className="panel-card planning-overview" aria-label="Progresso geral do planejamento">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Uso do orçamento</p>
            <h2>Progresso geral</h2>
          </div>
          <strong>{totalProgressLabel}% utilizado</strong>
        </div>
        <div className="progress-track progress-track-large" aria-label={`${totalProgressLabel}% utilizado`}>
          <span style={{ width: `${totalProgress}%` }} />
        </div>
      </section>

      {categories.length === 0 ? (
        <EmptyState
          action={{ href: "/categorias/nova", label: "Criar categoria" }}
          description="Crie uma categoria de despesa antes de definir o planejamento mensal."
          icon="planning"
          title="Nenhuma categoria de despesa ativa"
        />
      ) : (
        <section className="planning-list" aria-label="Orçamentos por categoria">
          {categories.map((category) => {
            const budget = budgetsByCategory.get(category.id);
            const planned = budget?.amount ?? money(0);
            const realized = realizedByCategory.get(category.id) ?? money(0);
            const remaining = money(planned.minus(realized));
            const actualProgress = planned.greaterThan(0)
              ? realized.dividedBy(planned).times(100).toNumber()
              : 0;
            const progress = planned.greaterThan(0)
              ? Decimal.min(actualProgress, 100).toNumber()
              : 0;

            return (
              <article
                className={`planning-row${
                  remaining.isNegative()
                    ? " planning-row-over"
                    : actualProgress >= 80
                      ? " planning-row-warning"
                      : ""
                }`}
                key={category.id}
              >
                <div className="planning-category">
                  <span className="entity-color" style={{ backgroundColor: category.color ?? "#256b4b" }} />
                  <div>
                    <strong>{category.name}</strong>
                    <span>
                      {formatCurrency(realized)} de {formatCurrency(planned)}
                    </span>
                  </div>
                </div>
                <div className="progress-track" aria-label={`${actualProgress.toFixed(0)}% utilizado`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="planning-balance">
                  <strong className={remaining.isNegative() ? "value-expense" : ""}>
                    {formatCurrency(remaining)}
                  </strong>
                  <span>{actualProgress.toFixed(0)}% utilizado</span>
                </div>
                <BudgetForm
                  action={saveBudgetAction}
                  amount={planned.toFixed(2).replace(".", ",")}
                  budgetId={budget?.id}
                  categoryId={category.id}
                  categoryName={category.name}
                  month={month}
                  version={budget?.version}
                />
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
