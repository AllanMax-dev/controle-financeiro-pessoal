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
import { calendarDateInTimeZone } from "@/modules/shared/domain/calendar";

export default async function DashboardPage() {
  const access = await requireCurrentAccess();
  const today = calendarDateInTimeZone(new Date(), access.workspaceTimezone);
  const [summary, debtOverview] = await Promise.all([
    getDashboardSummary(access.workspaceId, today),
    getDebtOverview(access.workspaceId, today),
  ]);
  const pendingFixedExpenses = summary.fixedExpenses.items
    .filter(({ paid }) => !paid)
    .slice(0, 3);
  const pendingSalaryInstallments = summary.salaries.items
    .flatMap((salary) => salary.installments.map((installment) => ({ installment, salary })))
    .filter(({ installment }) => !installment.received)
    .slice(0, 3);
  const upcomingDebtInstallments = debtOverview.debts
    .flatMap((debt) => debt.canceledAt || !debt.nextInstallment
      ? []
      : [{ debt, installment: debt.nextInstallment }])
    .slice(0, 3);

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

      <section className="dashboard-overview-grid" aria-label="Resumo financeiro">
        <article className="metric-card metric-card-featured dashboard-overview-card dashboard-balance-card">
          <div className="dashboard-overview-heading">
            <span className="metric-icon" aria-hidden="true">
              <Icon name="account" />
            </span>
            <div>
              <span>Saldo consolidado</span>
              <small>{summary.accounts.filter(({ active }) => active).length} contas ativas</small>
            </div>
          </div>
          <strong className="dashboard-primary-value">{formatCurrency(summary.totalBalance)}</strong>
          <div className="dashboard-projected-row">
            <div>
              <span>Saldo projetado</span>
              <small>Após receber e pagar pendências</small>
            </div>
            <strong>{formatCurrency(summary.projectedBalance)}</strong>
          </div>
        </article>

        <article className="metric-card dashboard-overview-card">
          <div className="dashboard-overview-heading">
            <span className="metric-icon metric-icon-income" aria-hidden="true">
              <Icon name="dashboard" />
            </span>
            <div>
              <span>Resultado do mês</span>
              <small>Somente valores realizados</small>
            </div>
          </div>
          <strong
            className={`dashboard-primary-value ${
              summary.periodResult.result.isNegative() ? "value-expense" : "value-income"
            }`}
          >
            {formatCurrency(summary.periodResult.result)}
          </strong>
          <div className="dashboard-split-values">
            <div>
              <span>Entradas</span>
              <strong className="value-income">{formatCurrency(summary.periodResult.income)}</strong>
            </div>
            <div>
              <span>Saídas</span>
              <strong className="value-expense">{formatCurrency(summary.periodResult.expense)}</strong>
            </div>
          </div>
        </article>

        <article className="metric-card dashboard-overview-card">
          <div className="dashboard-overview-heading">
            <span className="metric-icon metric-icon-warning" aria-hidden="true">
              <Icon name="calendar" />
            </span>
            <div>
              <span>Valores pendentes</span>
              <small>O que ainda entra e sai</small>
            </div>
          </div>
          <div className="dashboard-pending-values">
            <div>
              <span>A pagar</span>
              <strong className={summary.pendingExpense.isPositive() ? "value-expense" : ""}>
                {formatCurrency(summary.pendingExpense)}
              </strong>
            </div>
            <div>
              <span>A receber</span>
              <strong className={summary.pendingIncome.isPositive() ? "value-income" : ""}>
                {formatCurrency(summary.pendingIncome)}
              </strong>
            </div>
          </div>
        </article>
      </section>

      <section className="dashboard-operational-grid" aria-label="Próximas ações">
        <article className="panel-card dashboard-action-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">A pagar</p>
              <h2>Próximos pagamentos</h2>
            </div>
            <Link className="text-button" href="/despesas-fixas">
              Ver pagamentos
            </Link>
          </div>
          {pendingFixedExpenses.length === 0 ? (
            <div className="compact-empty">Nenhuma despesa fixa pendente no período.</div>
          ) : (
            <ul className="fixed-expense-dashboard-list">
              {pendingFixedExpenses.map((fixedExpense) => (
                <li key={fixedExpense.id}>
                  <span>
                    <strong>{fixedExpense.description}</strong>
                    <small>{fixedExpense.editor.displayName} · {formatDate(fixedExpense.dueDate)}</small>
                  </span>
                  <strong className={fixedExpense.overdue ? "value-expense" : ""}>
                    {formatCurrency(fixedExpense.amount)}
                  </strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel-card dashboard-action-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">A receber</p>
              <h2>Próximos recebimentos</h2>
            </div>
            <Link className="text-button" href="/salarios">
              Ver salários
            </Link>
          </div>
          {pendingSalaryInstallments.length === 0 ? (
            <div className="compact-empty">Nenhum recebimento pendente no período.</div>
          ) : (
            <ul className="fixed-expense-dashboard-list">
              {pendingSalaryInstallments.map(({ installment, salary }) => (
                <li key={`${salary.id}-${installment.installment}`}>
                  <span>
                    <strong>{salary.description}</strong>
                    <small>{salary.editor.displayName} · {formatDate(installment.dueDate)}</small>
                  </span>
                  <strong>{formatCurrency(installment.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
        </article>

        <article className="panel-card dashboard-action-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Parcelas</p>
              <h2>Próximas dívidas</h2>
            </div>
            <Link className="text-button" href="/dividas">
              Ver dívidas
            </Link>
          </div>
          {upcomingDebtInstallments.length === 0 ? (
            <div className="compact-empty">Nenhuma parcela pendente para acompanhar.</div>
          ) : (
            <ul className="fixed-expense-dashboard-list">
              {upcomingDebtInstallments.map(({ debt, installment }) => (
                <li key={installment.id}>
                  <span>
                    <strong>{debt.description}</strong>
                    <small>Parcela {installment.number}/{debt.installmentCount} · {formatDate(installment.dueDate)}</small>
                  </span>
                  <strong>{formatCurrency(installment.amount)}</strong>
                </li>
              ))}
            </ul>
          )}
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
              <h2>Dívidas deste mês</h2>
            </div>
            <Link className="text-button" href="/dividas">
              Ver dívidas
            </Link>
          </div>
          <div className="dashboard-debt-grid">
            <div>
              <span>Total do casal</span>
              <strong>{formatCurrency(debtOverview.dueThisMonth)}</strong>
              <small>{formatCurrency(debtOverview.coupleOutstanding)} em aberto no total</small>
            </div>
            {debtOverview.editors.slice(0, 2).map((editor) => (
              <div key={editor.id}>
                <span>{editor.displayName}</span>
                <strong>{formatCurrency(editor.dueThisMonth)}</strong>
                <small>{formatCurrency(editor.outstanding)} em aberto no total</small>
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

        <article className="panel-card dashboard-fixed-expense-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Recorrência mensal</p>
              <h2>Despesas fixas</h2>
            </div>
            <Link className="text-button" href="/despesas-fixas">
              Ver despesas fixas
            </Link>
          </div>
          {summary.fixedExpenses.items.length === 0 ? (
            <EmptyState
              action={{ href: "/despesas-fixas/nova", label: "Cadastrar despesa fixa" }}
              description="Aluguel, feira e outras despesas recorrentes aparecerão aqui."
              icon="calendar"
              title="Nenhuma despesa fixa"
            />
          ) : (
            <>
              <div className="fixed-expense-dashboard-summary">
                <div>
                  <span>Previsto</span>
                  <strong>{formatCurrency(summary.fixedExpenses.expected)}</strong>
                </div>
                <div>
                  <span>Pago</span>
                  <strong>{formatCurrency(summary.fixedExpenses.paid)}</strong>
                </div>
                <div>
                  <span>Pendente</span>
                  <strong className={summary.fixedExpenses.pending.isPositive() ? "value-expense" : ""}>
                    {formatCurrency(summary.fixedExpenses.pending)}
                  </strong>
                </div>
              </div>
              <ul className="fixed-expense-dashboard-list">
                {summary.fixedExpenses.items.slice(0, 4).map((fixedExpense) => (
                  <li key={fixedExpense.id}>
                    <span>
                      <strong>{fixedExpense.description}</strong>
                      <small>{fixedExpense.editor.displayName} · {formatDate(fixedExpense.dueDate)}</small>
                    </span>
                    <strong className={fixedExpense.overdue ? "value-expense" : ""}>
                      {fixedExpense.paid ? "Paga" : formatCurrency(fixedExpense.amount)}
                    </strong>
                  </li>
                ))}
              </ul>
            </>
          )}
        </article>

        <article className="panel-card dashboard-fixed-expense-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Receitas recorrentes</p>
              <h2>Salários</h2>
            </div>
            <Link className="text-button" href="/salarios">
              Ver salários
            </Link>
          </div>
          {summary.salaries.items.length === 0 ? (
            <EmptyState
              action={{ href: "/salarios/novo", label: "Cadastrar salário" }}
              description="Salários mensais e quinzenais aparecerão aqui."
              icon="income"
              title="Nenhum salário cadastrado"
            />
          ) : (
            <>
              <div className="fixed-expense-dashboard-summary">
                <div>
                  <span>Previsto</span>
                  <strong>{formatCurrency(summary.salaries.expected)}</strong>
                </div>
                <div>
                  <span>Recebido</span>
                  <strong className="value-income">{formatCurrency(summary.salaries.received)}</strong>
                </div>
                <div>
                  <span>A receber</span>
                  <strong>{formatCurrency(summary.salaries.pending)}</strong>
                </div>
              </div>
              <ul className="fixed-expense-dashboard-list">
                {summary.salaries.items
                  .flatMap((salary) => salary.installments.map((installment) => ({ installment, salary })))
                  .slice(0, 4)
                  .map(({ installment, salary }) => (
                    <li key={`${salary.id}-${installment.installment}`}>
                      <span>
                        <strong>{salary.description}</strong>
                        <small>{salary.editor.displayName} · {formatDate(installment.dueDate)}</small>
                      </span>
                      <strong className={installment.received ? "value-income" : ""}>
                        {installment.received ? "Recebido" : formatCurrency(installment.amount)}
                      </strong>
                    </li>
                  ))}
              </ul>
            </>
          )}
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
