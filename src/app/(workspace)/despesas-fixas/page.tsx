import Link from "next/link";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { PayFixedExpenseForm } from "@/components/pay-fixed-expense-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { dateInputInTimeZone, monthInputInTimeZone } from "@/modules/shared/domain/calendar";
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

function normalizeMonth(value: string | undefined, fallbackMonth: string): string {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? value
    : fallbackMonth;
}

export default async function FixedExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const access = await requireCurrentAccess();
  const filters = await searchParams;
  const now = new Date();
  const todayInput = dateInputInTimeZone(now, access.workspaceTimezone);
  const monthInput = normalizeMonth(
    filters.month,
    monthInputInTimeZone(now, access.workspaceTimezone),
  );
  const month = new Date(`${monthInput}-01T00:00:00.000Z`);
  const overview = await getFixedExpenseOverview(access.workspaceId, month);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Recorrência mensal</p>
          <h1>Despesas fixas</h1>
          <p>Gerencie despesas recorrentes e acompanhe os pagamentos.</p>
        </div>
        <div className="page-actions fixed-expense-page-actions">
          <form className="month-picker" method="get">
            <label>
              <span>Mês</span>
              <input name="month" type="month" defaultValue={monthInput} />
            </label>
            <button className="secondary-button" type="submit">
              Exibir
            </button>
          </form>
          <Link className="primary-button" href="/despesas-fixas/nova">
            <Icon name="add" />
            Nova despesa fixa
          </Link>
        </div>
      </section>

      <section className="recurrence-section" aria-labelledby="fixed-expense-payments-heading">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Ocorrências do mês</p>
            <h2 id="fixed-expense-payments-heading">Pagamentos de {MONTH_FORMATTER.format(overview.month)}</h2>
          </div>
        </header>
        <div className="metric-grid fixed-expense-metrics" aria-label="Resumo dos pagamentos do mês">
          <article className="metric-card metric-card-featured">
            <span>Previsto no mês</span>
            <strong>{formatCurrency(overview.expected)}</strong>
            <small>{overview.items.length} despesas recorrentes</small>
          </article>
          <article className="metric-card">
            <span>Pago</span>
            <strong className="value-income">{formatCurrency(overview.paid)}</strong>
            <small>{overview.paidCount} pagamentos registrados</small>
          </article>
          <article className="metric-card">
            <span>A pagar</span>
            <strong className={overview.pending.isPositive() ? "value-expense" : ""}>
              {formatCurrency(overview.pending)}
            </strong>
            <small>{overview.overdueCount} vencidas</small>
          </article>
        </div>
      </section>

      {overview.items.length === 0 ? (
        <EmptyState
          action={{ href: "/despesas-fixas/nova", label: "Cadastrar despesa fixa" }}
          description="Cadastre uma despesa recorrente para acompanhar os pagamentos ao longo dos meses."
          icon="calendar"
          title="Nenhuma despesa recorrente cadastrada"
        />
      ) : (
        <section className="recurrence-section" aria-labelledby="fixed-expense-configurations-heading">
          <header className="section-heading">
            <div>
              <p className="eyebrow">Configurações recorrentes</p>
              <h2 id="fixed-expense-configurations-heading">Despesas recorrentes</h2>
              <p>Compromissos que se repetem até serem encerrados.</p>
            </div>
          </header>
          <section className="fixed-expense-person-groups" aria-label="Despesas fixas por pessoa">
            {overview.editorGroups.map((group) => (
            <section className="fixed-expense-person-section" key={group.editor.id}>
              <header className="fixed-expense-person-heading">
                <div>
                  <p className="eyebrow">Responsável pela recorrência</p>
                  <h2>{group.editor.displayName}</h2>
                </div>
                <div className="fixed-expense-person-totals" aria-label={`Resumo de ${group.editor.displayName}`}>
                  <span>
                    Previsto <strong>{formatCurrency(group.expected)}</strong>
                  </span>
                  <span>
                    Pago <strong>{formatCurrency(group.paid)}</strong>
                  </span>
                  <span>
                    Pendente <strong>{formatCurrency(group.pending)}</strong>
                  </span>
                </div>
              </header>

              <div className="fixed-expense-list">
                {group.items.map((fixedExpense) => (
                  <article className="fixed-expense-card" key={fixedExpense.id}>
                    <header>
                      <div>
                        <span
                          className={`status-pill ${
                            fixedExpense.paid
                              ? "status-paid"
                              : fixedExpense.overdue
                                ? "status-overdue"
                                : "status-pending"
                          }`}
                        >
                          {fixedExpense.paid ? "Pago" : fixedExpense.overdue ? "Vencida" : "Pendente"}
                        </span>
                        <h2>{fixedExpense.description}</h2>
                        <p>
                          {fixedExpense.category.name} · {fixedExpense.account.name}
                        </p>
                      </div>
                      <div className="fixed-expense-value">
                        <span>Valor previsto</span>
                        <strong>{formatCurrency(fixedExpense.amount)}</strong>
                        <small>Vence em {formatDate(fixedExpense.dueDate)}</small>
                      </div>
                    </header>

                    <div className="occurrence-heading occurrence-heading-compact">
                      <div>
                        <p className="eyebrow">Pagamento do mês</p>
                        <h3>{MONTH_FORMATTER.format(overview.month)}</h3>
                      </div>
                    </div>

                    {fixedExpense.paid && fixedExpense.payment ? (
                      <p className="fixed-expense-paid-note">
                        Pagamento de {formatCurrency(fixedExpense.payment.amount)} em{" "}
                        {formatDate(fixedExpense.payment.settledAt ?? fixedExpense.payment.competenceDate)}.
                      </p>
                    ) : fixedExpense.active ? (
                      <PayFixedExpenseForm
                        action={payFixedExpenseAction}
                        amount={fixedExpense.amount.toFixed(2).replace(".", ",")}
                        currentDate={todayInput}
                        fixedExpenseId={fixedExpense.id}
                        month={monthInput}
                      />
                    ) : (
                      <p className="fixed-expense-paid-note">Esta recorrência foi encerrada.</p>
                    )}

                    <div className="fixed-expense-actions">
                      {fixedExpense.paid && fixedExpense.payment ? (
                        <Link
                          className="text-button"
                          href={`/lancamentos/${fixedExpense.payment.id}/editar`}
                        >
                          Editar pagamento
                        </Link>
                      ) : null}
                      {fixedExpense.active ? (
                        <>
                          <Link
                            className="text-button"
                            href={`/despesas-fixas/${fixedExpense.id}/editar`}
                          >
                            Editar recorrência
                          </Link>
                          <ConfirmActionForm
                            action={archiveFixedExpenseAction}
                            fields={{ id: fixedExpense.id, version: String(fixedExpense.version) }}
                            label="Encerrar recorrência"
                            message="Encerrar esta despesa fixa? Os pagamentos já registrados permanecerão no histórico."
                          />
                        </>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            </section>
            ))}
          </section>
        </section>
      )}
    </>
  );
}
