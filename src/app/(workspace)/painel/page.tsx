import Link from "next/link";

import { ExpenseCategoryChart } from "@/components/expense-category-chart";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getDashboardSummary } from "@/modules/dashboard/application/get-dashboard-summary";

export default async function DashboardPage() {
  const access = await requireCurrentAccess();
  const summary = await getDashboardSummary(access.workspaceId);

  return (
    <>
      <section className="page-heading dashboard-heading">
        <div>
          <p className="eyebrow">Visão geral</p>
          <h1>Olá, {access.editorName}.</h1>
          <p>Valores realizados atualizam os saldos; valores pendentes aparecem separadamente.</p>
        </div>
        <Link className="primary-button" href="/lancamentos/novo">
          Novo lançamento
        </Link>
      </section>

      <section className="metric-grid" aria-label="Indicadores financeiros">
        <article className="metric-card metric-card-featured">
          <span>Saldo consolidado</span>
          <strong>{formatCurrency(summary.totalBalance)}</strong>
          <small>{summary.accounts.filter(({ active }) => active).length} contas ativas</small>
        </article>
        <article className="metric-card">
          <span>Receitas realizadas</span>
          <strong className="value-income">{formatCurrency(summary.periodResult.income)}</strong>
          <small>{formatCurrency(summary.pendingIncome)} a receber</small>
        </article>
        <article className="metric-card">
          <span>Despesas realizadas</span>
          <strong className="value-expense">{formatCurrency(summary.periodResult.expense)}</strong>
          <small>{formatCurrency(summary.pendingExpense)} a pagar</small>
        </article>
        <article className="metric-card">
          <span>Resultado do mês</span>
          <strong>{formatCurrency(summary.periodResult.result)}</strong>
          <small>Receitas menos despesas realizadas</small>
        </article>
      </section>

      <section className="dashboard-columns">
        <article className="panel-card">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Composição</p>
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
            <div className="compact-empty">
              <p>Cadastre uma conta para acompanhar o saldo.</p>
              <Link className="text-button" href="/contas/nova">
                Criar conta
              </Link>
            </div>
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
          <div className="compact-empty">
            <p>Os lançamentos mais recentes aparecerão aqui.</p>
          </div>
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
