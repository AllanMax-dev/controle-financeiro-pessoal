import Decimal from "decimal.js";

import { BudgetForm } from "@/components/budget-form";
import { getDatabase } from "@/lib/db";
import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
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

      {categories.length === 0 ? (
        <section className="empty-state">
          <h2>Nenhuma categoria de despesa ativa</h2>
          <p>Crie uma categoria de despesa antes de definir o planejamento mensal.</p>
        </section>
      ) : (
        <section className="planning-list" aria-label="Orçamentos por categoria">
          {categories.map((category) => {
            const budget = budgetsByCategory.get(category.id);
            const planned = budget?.amount ?? money(0);
            const realized = realizedByCategory.get(category.id) ?? money(0);
            const remaining = money(planned.minus(realized));
            const progress = planned.greaterThan(0)
              ? Decimal.min(realized.dividedBy(planned).times(100), 100).toNumber()
              : 0;

            return (
              <article className="planning-row" key={category.id}>
                <div className="planning-category">
                  <span className="entity-color" style={{ backgroundColor: category.color ?? "#256b4b" }} />
                  <div>
                    <strong>{category.name}</strong>
                    <span>
                      {formatCurrency(realized)} de {formatCurrency(planned)}
                    </span>
                  </div>
                </div>
                <div className="progress-track" aria-label={`${progress.toFixed(0)}% utilizado`}>
                  <span style={{ width: `${progress}%` }} />
                </div>
                <strong className={remaining.isNegative() ? "value-expense" : ""}>
                  {formatCurrency(remaining)}
                </strong>
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
