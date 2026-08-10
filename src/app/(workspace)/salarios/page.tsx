import Link from "next/link";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { ReceiveSalaryForm } from "@/components/receive-salary-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getSalaryOverview } from "@/modules/salaries/application/get-salary-overview";
import { calendarDateInTimeZone } from "@/modules/shared/domain/calendar";
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
  const today = calendarDateInTimeZone(new Date(), access.workspaceTimezone);
  const overview = await getSalaryOverview(access.workspaceId, today);
  const monthInput = overview.month.toISOString().slice(0, 7);
  const todayInput = today.toISOString().slice(0, 10);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Receitas recorrentes</p>
          <h1>Salários</h1>
          <p>Gerencie suas rendas recorrentes e acompanhe os recebimentos.</p>
        </div>
        <Link className="primary-button" href="/salarios/novo">
          <Icon name="add" />
          Novo salário
        </Link>
      </section>

      <section className="recurrence-section" aria-labelledby="salary-payments-heading">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Ocorrências do mês</p>
            <h2 id="salary-payments-heading">Recebimentos de {MONTH_FORMATTER.format(overview.month)}</h2>
          </div>
        </header>
        <div className="metric-grid fixed-expense-metrics" aria-label="Resumo dos recebimentos do mês">
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
        </div>
      </section>

      {overview.editorGroups.length > 0 ? (
        <section className="fixed-expense-person-groups" aria-label="Salários por pessoa">
          {overview.editorGroups.map((group) => (
            <section className="fixed-expense-person-section" key={group.editor.id}>
              <header className="fixed-expense-person-heading">
                <div>
                  <p className="eyebrow">Responsável pela renda</p>
                  <h2>{group.editor.displayName}</h2>
                </div>
                <div className="fixed-expense-person-totals" aria-label={`Resumo de ${group.editor.displayName}`}>
                  <span>
                    Previsto <strong>{formatCurrency(group.expected)}</strong>
                  </span>
                  <span>
                    Recebido <strong>{formatCurrency(group.received)}</strong>
                  </span>
                  <span>
                    A receber <strong>{formatCurrency(group.pending)}</strong>
                  </span>
                </div>
              </header>
            </section>
          ))}
        </section>
      ) : null}

      {overview.items.length === 0 ? (
        <EmptyState
          action={{ href: "/salarios/novo", label: "Cadastrar salário" }}
          description="Cadastre uma renda recorrente para acompanhar recebimentos ao longo dos meses."
          icon="income"
          title="Nenhum salário cadastrado"
        />
      ) : (
        <section className="recurrence-section" aria-labelledby="salary-configurations-heading">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Configurações recorrentes</p>
              <h2 id="salary-configurations-heading">Salários cadastrados</h2>
              <p>Fontes de renda que continuam ativas até serem encerradas.</p>
            </div>
          </header>
          <div className="fixed-expense-list" aria-label="Salários cadastrados">
            {overview.items.map((salary) => {
              const receivedCount = salary.installments.filter(({ received }) => received).length;
              const recurrenceClosed = !salary.active;
              const allReceived = salary.installments.length > 0
                && receivedCount === salary.installments.length;
              const hasOverdue = salary.installments.some(({ overdue }) => overdue);
              const summaryStatus = recurrenceClosed
                ? "Encerrado"
                : allReceived
                  ? "Recebido"
                : hasOverdue
                  ? "Atrasado"
                  : receivedCount > 0
                    ? "Parcial"
                    : "A receber";
              const summaryStatusClass = recurrenceClosed
                ? "status-canceled"
                : allReceived
                  ? "status-paid"
                : hasOverdue
                  ? "status-overdue"
                  : "status-pending";

              return (
            <article className="fixed-expense-card debt-card-collapsible" key={salary.id}>
              <details className="debt-disclosure">
                <summary className="debt-compact-summary">
                  <span className="debt-compact-copy">
                    <span className="debt-compact-month">
                      Mês de {MONTH_FORMATTER.format(overview.month)}
                    </span>
                    <strong>
                      {salary.description} ({salary.frequency === "MONTHLY" ? "Mensal" : "Quinzenal"})
                    </strong>
                    <small>
                      {salary.category.name} · {salary.account.name} · {salary.editor.displayName} · Ver detalhes
                    </small>
                  </span>
                  <span className="debt-compact-value">
                    <small>Valor no mês</small>
                    <strong>{formatCurrency(salary.amount)}</strong>
                    <span className={`status-pill ${summaryStatusClass}`}>{summaryStatus}</span>
                  </span>
                  <span className="debt-expand-indicator" aria-hidden="true" />
                </summary>

                <div className="debt-expanded-content">
                  <header>
                <div>
                  <span className={`status-pill ${salary.active ? "status-pending" : "status-canceled"}`}>
                    {salary.active ? (salary.frequency === "MONTHLY" ? "Mensal" : "Quinzenal") : "Encerrado"}
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

              <div className="occurrence-heading">
                <div>
                  <p className="eyebrow">Ocorrências do mês</p>
                  <h3>Recebimentos de {MONTH_FORMATTER.format(overview.month)}</h3>
                </div>
              </div>
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
                      <>
                        <p className="fixed-expense-paid-note">
                          Recebido {formatCurrency(installment.payment.amount)} em {formatDate(installment.payment.settledAt ?? installment.payment.competenceDate)}.
                        </p>
                        <Link
                          className="text-button"
                          href={`/lancamentos/${installment.payment.id}/editar`}
                        >
                          Editar recebimento
                        </Link>
                      </>
                    ) : salary.active ? (
                      <ReceiveSalaryForm
                        action={receiveSalaryAction}
                        amount={installment.amount.toFixed(2).replace(".", ",")}
                        currentDate={todayInput}
                        installment={installment.installment}
                        month={monthInput}
                        salaryId={salary.id}
                      />
                    ) : (
                      <p className="fixed-expense-paid-note">Recorrência encerrada; nenhum novo recebimento será criado.</p>
                    )}
                  </section>
                ))}
              </div>

                  {salary.active ? (
                  <div className="fixed-expense-actions">
                <ConfirmActionForm
                  action={archiveSalaryAction}
                  fields={{ id: salary.id, version: String(salary.version) }}
                  label="Encerrar recorrência"
                  message="Encerrar este salário? Os recebimentos já registrados permanecerão no histórico."
                />
                  </div>
                  ) : null}
                </div>
              </details>
            </article>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}
