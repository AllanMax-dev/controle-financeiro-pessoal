import Link from "next/link";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { ReceiveSalaryForm } from "@/components/receive-salary-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getSalaryOverview } from "@/modules/salaries/application/get-salary-overview";
import {
  archiveSalaryAction,
  receiveSalaryAction,
} from "@/modules/salaries/application/salary-actions";

const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "long",
  timeZone: "UTC",
  year: "numeric",
});

export default async function SalariesPage() {
  const access = await requireCurrentAccess();
  const overview = await getSalaryOverview(access.workspaceId);
  const monthInput = overview.month.toISOString().slice(0, 7);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Receitas recorrentes</p>
          <h1>Salários</h1>
          <p>Acompanhe os salários mensais e quinzenais de {MONTH_FORMATTER.format(overview.month)}.</p>
        </div>
        <Link className="primary-button" href="/salarios/novo">
          <Icon name="add" />
          Novo salário
        </Link>
      </section>

      <section className="metric-grid fixed-expense-metrics" aria-label="Resumo dos salários">
        <article className="metric-card metric-card-featured">
          <span>Previsto no mês</span>
          <strong>{formatCurrency(overview.expected)}</strong>
          <small>{overview.items.length} salários ativos</small>
        </article>
        <article className="metric-card">
          <span>Recebido</span>
          <strong className="value-income">{formatCurrency(overview.received)}</strong>
          <small>{overview.receivedCount} recebimentos registrados</small>
        </article>
        <article className="metric-card">
          <span>A receber</span>
          <strong>{formatCurrency(overview.pending)}</strong>
          <small>{overview.overdueCount} recebimentos atrasados</small>
        </article>
      </section>

      {overview.items.length === 0 ? (
        <EmptyState
          action={{ href: "/salarios/novo", label: "Cadastrar salário" }}
          description="Cadastre o salário mensal ou quinzenal de cada pessoa."
          icon="income"
          title="Nenhum salário ativo"
        />
      ) : (
        <section className="fixed-expense-list" aria-label="Salários ativos">
          {overview.items.map((salary) => (
            <article className="fixed-expense-card" key={salary.id}>
              <header>
                <div>
                  <span className="status-pill status-pending">
                    {salary.frequency === "MONTHLY" ? "Mensal" : "Quinzenal"}
                  </span>
                  <h2>{salary.description}</h2>
                  <p>{salary.category.name} · {salary.account.name} · {salary.editor.displayName}</p>
                </div>
                <div className="fixed-expense-value">
                  <span>Valor mensal</span>
                  <strong>{formatCurrency(salary.amount)}</strong>
                  <small>{salary.frequency === "MONTHLY" ? `Dia ${salary.paymentDay}` : "Dias 15 e 30"}</small>
                </div>
              </header>

              <div className="salary-installment-list">
                {salary.installments.map((installment) => (
                  <section className="salary-installment" key={installment.installment}>
                    <div className="salary-installment-heading">
                      <div>
                        <span className={`status-pill ${installment.received ? "status-paid" : installment.overdue ? "status-overdue" : "status-pending"}`}>
                          {installment.received ? "Recebido" : installment.overdue ? "Atrasado" : "A receber"}
                        </span>
                        <strong>
                          {salary.frequency === "FORTNIGHTLY"
                            ? `${installment.installment}ª quinzena`
                            : "Recebimento mensal"}
                        </strong>
                        <small>Previsto para {formatDate(installment.dueDate)}</small>
                      </div>
                      <strong>{formatCurrency(installment.amount)}</strong>
                    </div>

                    {installment.received && installment.payment ? (
                      <p className="fixed-expense-paid-note">
                        Recebido {formatCurrency(installment.payment.amount)} em {formatDate(installment.payment.settledAt ?? installment.payment.competenceDate)}.
                      </p>
                    ) : (
                      <ReceiveSalaryForm
                        action={receiveSalaryAction}
                        amount={installment.amount.toFixed(2).replace(".", ",")}
                        installment={installment.installment}
                        month={monthInput}
                        salaryId={salary.id}
                      />
                    )}
                  </section>
                ))}
              </div>

              <div className="fixed-expense-actions">
                <ConfirmActionForm
                  action={archiveSalaryAction}
                  fields={{ id: salary.id, version: String(salary.version) }}
                  label="Encerrar recorrência"
                  message="Encerrar este salário? Os recebimentos já registrados permanecerão no histórico."
                />
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
