import Link from "next/link";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { PayFixedExpenseForm } from "@/components/pay-fixed-expense-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  archiveFixedExpenseAction,
  payFixedExpenseAction,
} from "@/modules/fixed-expenses/application/fixed-expense-actions";
import { getFixedExpenseOverview } from "@/modules/fixed-expenses/application/get-fixed-expense-overview";

const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

export default async function FixedExpensesPage() {
  const access = await requireCurrentAccess();
  const overview = await getFixedExpenseOverview(access.workspaceId);
  const monthInput = overview.month.toISOString().slice(0, 7);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Recorrência mensal</p>
          <h1>Despesas fixas</h1>
          <p>Acompanhe aluguel, feira, contas e outros compromissos de {MONTH_FORMATTER.format(overview.month)}.</p>
        </div>
        <Link className="primary-button" href="/despesas-fixas/nova">
          <Icon name="add" />
          Nova despesa fixa
        </Link>
      </section>

      <section className="metric-grid fixed-expense-metrics" aria-label="Resumo das despesas fixas">
        <article className="metric-card metric-card-featured">
          <span>Previsto no mês</span>
          <strong>{formatCurrency(overview.expected)}</strong>
          <small>{overview.items.length} despesas ativas</small>
        </article>
        <article className="metric-card">
          <span>Pago</span>
          <strong className="value-income">{formatCurrency(overview.paid)}</strong>
          <small>{overview.paidCount} pagamentos registrados</small>
        </article>
        <article className="metric-card">
          <span>Pendente</span>
          <strong className={overview.pending.isPositive() ? "value-expense" : ""}>
            {formatCurrency(overview.pending)}
          </strong>
          <small>{overview.overdueCount} vencidas</small>
        </article>
      </section>

      {overview.items.length === 0 ? (
        <EmptyState
          action={{ href: "/despesas-fixas/nova", label: "Cadastrar despesa fixa" }}
          description="Cadastre aluguel, feira, internet ou outro compromisso mensal."
          icon="calendar"
          title="Nenhuma despesa fixa ativa"
        />
      ) : (
        <section className="fixed-expense-list" aria-label="Despesas fixas ativas">
          {overview.items.map((fixedExpense) => (
            <article className="fixed-expense-card" key={fixedExpense.id}>
              <header>
                <div>
                  <span className={`status-pill ${fixedExpense.paid ? "status-paid" : fixedExpense.overdue ? "status-overdue" : "status-pending"}`}>
                    {fixedExpense.paid ? "Paga" : fixedExpense.overdue ? "Vencida" : "Pendente"}
                  </span>
                  <h2>{fixedExpense.description}</h2>
                  <p>
                    {fixedExpense.category.name} · {fixedExpense.account.name} · {fixedExpense.editor.displayName}
                  </p>
                </div>
                <div className="fixed-expense-value">
                  <span>Valor previsto</span>
                  <strong>{formatCurrency(fixedExpense.amount)}</strong>
                  <small>Vence em {formatDate(fixedExpense.dueDate)}</small>
                </div>
              </header>

              {fixedExpense.paid && fixedExpense.payment ? (
                <p className="fixed-expense-paid-note">
                  Pago por {formatCurrency(fixedExpense.payment.amount)} em {formatDate(fixedExpense.payment.settledAt ?? fixedExpense.payment.competenceDate)}.
                </p>
              ) : (
                <PayFixedExpenseForm
                  action={payFixedExpenseAction}
                  amount={fixedExpense.amount.toFixed(2).replace(".", ",")}
                  fixedExpenseId={fixedExpense.id}
                  month={monthInput}
                />
              )}

              <div className="fixed-expense-actions">
                <ConfirmActionForm
                  action={archiveFixedExpenseAction}
                  fields={{ id: fixedExpense.id, version: String(fixedExpense.version) }}
                  label="Encerrar recorrência"
                  message="Encerrar esta despesa fixa? Os pagamentos já registrados permanecerão no histórico."
                />
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
