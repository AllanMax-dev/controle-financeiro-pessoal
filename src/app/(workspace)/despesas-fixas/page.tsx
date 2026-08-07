import Link from "next/link";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { PayFixedExpenseForm } from "@/components/pay-fixed-expense-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { monthInputInTimeZone } from "@/modules/shared/domain/calendar";
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
  const monthInput = normalizeMonth(
    filters.month,
    monthInputInTimeZone(new Date(), access.workspaceTimezone),
  );
  const month = new Date(`${monthInput}-01T00:00:00.000Z`);
  const overview = await getFixedExpenseOverview(access.workspaceId, month);

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Recorrência mensal</p>
          <h1>Despesas fixas</h1>
          <p>
            Compromissos de {MONTH_FORMATTER.format(overview.month)} com baixa automática no dia
            do vencimento de cada mês.
          </p>
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

      <section className="metric-grid fixed-expense-metrics" aria-label="Resumo das despesas fixas">
        <article className="metric-card metric-card-featured">
          <span>Previsto no mês</span>
          <strong>{formatCurrency(overview.expected)}</strong>
          <small>{overview.items.length} despesas recorrentes</small>
        </article>
        <article className="metric-card">
          <span>Baixado</span>
          <strong className="value-income">{formatCurrency(overview.paid)}</strong>
          <small>{overview.paidCount} baixas registradas</small>
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
          title="Nenhuma despesa fixa neste mês"
        />
      ) : (
        <section className="fixed-expense-person-groups" aria-label="Despesas fixas por pessoa">
          {overview.editorGroups.map((group) => (
            <section className="fixed-expense-person-section" key={group.editor.id}>
              <header className="fixed-expense-person-heading">
                <div>
                  <p className="eyebrow">Responsável</p>
                  <h2>{group.editor.displayName}</h2>
                </div>
                <div className="fixed-expense-person-totals" aria-label={`Resumo de ${group.editor.displayName}`}>
                  <span>
                    Previsto <strong>{formatCurrency(group.expected)}</strong>
                  </span>
                  <span>
                    Baixado <strong>{formatCurrency(group.paid)}</strong>
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
                          {fixedExpense.paid ? "Baixada" : fixedExpense.overdue ? "Vencida" : "Pendente"}
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

                    {fixedExpense.paid && fixedExpense.payment ? (
                      <p className="fixed-expense-paid-note">
                        Baixa de {formatCurrency(fixedExpense.payment.amount)} em{" "}
                        {formatDate(fixedExpense.payment.settledAt ?? fixedExpense.payment.competenceDate)}.
                      </p>
                    ) : fixedExpense.active ? (
                      <PayFixedExpenseForm
                        action={payFixedExpenseAction}
                        amount={fixedExpense.amount.toFixed(2).replace(".", ",")}
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
                          Editar baixa
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
                            message="Encerrar esta despesa fixa? As baixas já registradas permanecerão no histórico."
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
      )}
    </>
  );
}
