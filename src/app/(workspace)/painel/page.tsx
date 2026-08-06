import Link from "next/link";

import {
  BudgetComparisonChart,
  MonthlyEvolutionChart,
} from "@/components/dashboard-analytics-charts";
import { ExpenseCategoryChart } from "@/components/expense-category-chart";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getDashboardSummary } from "@/modules/dashboard/application/get-dashboard-summary";
import { getDebtOverview } from "@/modules/debts/application/get-debt-overview";

export default async function DashboardPage() {
  const access = await requireCurrentAccess();
  const [summary, debtOverview] = await Promise.all([
    getDashboardSummary(access.workspaceId),
    getDebtOverview(access.workspaceId),
  ]);

  return (
    <>
      <section className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Olá, {access.editorName}.</h1>
          <p>Valores realizados atualizam os saldos; valores pendentes aparecem separadamente.</p>
        </div>
        <div className="page-actions">
          <Link className="primary-button" href="/lancamentos/novo">
            <Icon name="add" />
            Novo lançamento
          </Link>
          <Link className="secondary-button" href="/transferencias/nova">
            <Icon name="transfer" />
            Nova transferência
          </Link>
        </div>
      </section>

      <section className="metric-grid dashboard-metrics" aria-label="Indicadores financeiros">
        <article className="metric-card metric-card-featured">
          <span className="metric-icon metric-icon-info" aria-hidden="true">
            <Icon name="account" />
          </span>
          <span>Saldo consolidado</span>
          <strong>{formatCurrency(summary.totalBalance)}</strong>
          <small>{summary.accounts.filter(({ active }) => active).length} contas ativas</small>
        </article>
        <article className="metric-card metric-card-projected">
          <span className="metric-icon metric-icon-primary" aria-hidden="true">
            <Icon name="planning" />
          </span>
          <span>Saldo projetado</span>
          <strong>{formatCurrency(summary.projectedBalance)}</strong>
          <small>Considera pendências a receber e a pagar</small>
        </article>
        <article className="metric-card metric-card-result">
          <span className="metric-icon metric-icon-income" aria-hidden="true">
            <Icon name="dashboard" />
          </span>
          <span>Resultado do mês</span>
          <strong>{formatCurrency(summary.periodResult.result)}</strong>
          <small>Receitas menos despesas realizadas</small>
        </article>
        <article className="metric-card metric-card-warning">
          <span className="metric-icon metric-icon-warning" aria-hidden="true">
            <Icon name="calendar" />
          </span>
          <span>Valores pendentes</span>
          <strong>{formatCurrency(summary.pendingExpense)}</strong>
          <small>{formatCurrency(summary.pendingIncome)} a receber</small>
        </article>
        <article className="metric-card metric-card-compact">
          <span>Receitas realizadas</span>
          <strong className="value-income">{formatCurrency(summary.periodResult.income)}</strong>
          <small>{formatCurrency(summary.pendingIncome)} pendentes</small>
        </article>
        <article className="metric-card metric-card-compact">
          <span>Despesas realizadas</span>
          <strong className="value-expense">{formatCurrency(summary.periodResult.expense)}</strong>
          <small>
            {formatCurrency(summary.pendingExpense)} pendentes
          </small>
        </article>
      </section>

      <section className="dashboard-analytics-grid dashboard-analytics-main">
        <article className="panel-card dashboard-primary-chart">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Tendência</p>
              <h2>Evolução mensal</h2>
              <p>Receitas, despesas e resultado em uma leitura de longo prazo.</p>
            </div>
          </div>
          <MonthlyEvolutionChart data={summary.monthlyEvolution} />
        </article>

        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Orçamento</p>
              <h2>Planejado versus realizado</h2>
              <p>Comparação das categorias com orçamento definido no período.</p>
            </div>
          </div>
          <div className="budget-comparison-totals">
            <div>
              <span>Planejado</span>
              <strong>{formatCurrency(summary.budgetComparison.totalPlanned)}</strong>
            </div>
            <div>
              <span>Realizado</span>
              <strong>{formatCurrency(summary.budgetComparison.totalRealized)}</strong>
            </div>
            <div>
              <span>Restante</span>
              <strong
                className={summary.budgetComparison.remaining.isNegative() ? "value-expense" : ""}
              >
                {formatCurrency(summary.budgetComparison.remaining)}
              </strong>
            </div>
          </div>
          <BudgetComparisonChart data={summary.budgetComparison.categories} />
        </article>
      </section>

      <section className="dashboard-columns dashboard-secondary-grid">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Distribuição</p>
              <h2>Despesas por categoria</h2>
            </div>
          </div>
          <ExpenseCategoryChart data={summary.expenseByCategory} />
        </article>

        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Disponibilidade</p>
              <h2>Saldo por conta</h2>
            </div>
            <Link className="text-button" href="/contas">
              Ver contas
            </Link>
          </div>
          {summary.accounts.length === 0 ? (
            <EmptyState
              action={{ href: "/contas/nova", label: "Criar conta" }}
              description="Cadastre uma conta para acompanhar saldos e disponibilidade."
              icon="account"
              title="Nenhuma conta cadastrada"
            />
          ) : (
            <ul className="account-summary-list">
              {summary.accounts.slice(0, 6).map((account) => (
                <li key={account.id}>
                  <span className="legend-dot" style={{ backgroundColor: account.color ?? "#256b4b" }} />
                  <span>{account.name}</span>
                  <strong>{formatCurrency(account.balance)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel-card dashboard-debt-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Casal</p>
              <h2>Dívidas em aberto</h2>
            </div>
            <Link className="text-button" href="/dividas">
              Ver dívidas
            </Link>
          </div>
          <div className="dashboard-debt-grid">
            <div>
              <span>Total do casal</span>
              <strong>{formatCurrency(debtOverview.coupleOutstanding)}</strong>
            </div>
            {debtOverview.editors.slice(0, 2).map((editor) => (
              <div key={editor.id}>
                <span>{editor.displayName}</span>
                <strong>{formatCurrency(editor.outstanding)}</strong>
              </div>
            ))}
            <div>
              <span>Em atraso</span>
              <strong className={debtOverview.overdue.isPositive() ? "value-expense" : ""}>
                {formatCurrency(debtOverview.overdue)}
              </strong>
            </div>
          </div>
        </article>
      </section>

      <section className="panel-card recent-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">Histórico</p>
            <h2>Movimentações recentes</h2>
          </div>
          <Link className="text-button" href="/lancamentos">
            Ver todas
          </Link>
        </div>
        {summary.recentTransactions.length === 0 ? (
          <EmptyState
            description="Os lançamentos mais recentes aparecerão aqui assim que houver movimentação."
            icon="income"
            title="Nenhuma movimentação recente"
          />
        ) : (
          <div className="compact-transaction-list">
            {summary.recentTransactions.map((transaction) => (
              <div key={transaction.id}>
                <span className={transaction.type === "INCOME" ? "value-income" : "value-expense"}>
                  {transaction.type === "INCOME" ? "+" : "−"}
                </span>
                <span>
                  <strong>{transaction.description}</strong>
                  <small>
                    {transaction.account.name} · {formatDate(transaction.competenceDate)}
                  </small>
                </span>
                <strong>{formatCurrency(transaction.amount)}</strong>
              </div>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
