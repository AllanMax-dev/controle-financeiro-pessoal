import Link from "next/link";

import { ConfirmActionForm } from "@/components/confirm-action-form";
import { PayInstallmentForm } from "@/components/pay-installment-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  cancelDebtAction,
  payDebtInstallmentAction,
} from "@/modules/debts/application/debt-actions";
import { getDebtOverview } from "@/modules/debts/application/get-debt-overview";
import {
  contextHref,
  financialContextWhere,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import { calendarDateInTimeZone, monthInputInTimeZone } from "@/modules/shared/domain/calendar";
import { sumMoney } from "@/modules/shared/domain/money";

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

function shiftMonthInput(value: string, offset: number): string {
  const month = new Date(`${value}-01T00:00:00.000Z`);
  return new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + offset, 1),
  ).toISOString().slice(0, 7);
}

function debtsHref(month: string, contextId: string, person?: string) {
  return {
    pathname: "/dividas",
    query: person ? { contextId, month, person } : { contextId, month },
  } as const;
}

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams & { month?: string; person?: string }>;
}) {
  const access = await requireCurrentAccess();
  const database = getDatabase();
  const filters = await searchParams;
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(filters),
  );
  const currentContext = contextState.current;
  const now = new Date();
  const today = calendarDateInTimeZone(now, access.workspaceTimezone);
  const todayInput = today.toISOString().slice(0, 10);
  const currentMonthInput = monthInputInTimeZone(now, access.workspaceTimezone);
  const selectedMonthInput = normalizeMonth(filters.month, currentMonthInput);
  const selectedMonth = new Date(`${selectedMonthInput}-01T00:00:00.000Z`);
  const overviewDate = selectedMonthInput === currentMonthInput ? today : selectedMonth;
  const previousMonthInput = shiftMonthInput(selectedMonthInput, -1);
  const nextMonthInput = shiftMonthInput(selectedMonthInput, 1);
  const [overview, accounts] = await Promise.all([
    getDebtOverview(access.workspaceId, overviewDate, contextState.scope),
    database.financialAccount.findMany({
      where: {
        ...financialContextWhere(contextState.scope),
        workspaceId: access.workspaceId,
        active: true,
        type: { not: "INVESTMENT" },
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const selectedEditor = overview.editors.find(({ id }) => id === filters.person);
  const currentMonth = new Date(`${currentMonthInput}-01T00:00:00.000Z`);
  const isFutureMonth = selectedMonth > currentMonth;
  const debts = overview.debts.filter((debt) => {
    const hasSelectedPerson = selectedEditor
      ? debt.installments.some((installment) =>
          installment.shares.some(({ editorId }) => editorId === selectedEditor.id),
        )
      : true;
    const visibleInMonth = debt.monthInstallments.length > 0 || debt.overdueInstallments.length > 0;
    const settledInFuture = isFutureMonth && debt.outstanding.isZero();

    return hasSelectedPerson && visibleInMonth && !settledInFuture;
  });
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Responsabilidades</p>
          <h1>Dívidas</h1>
          <p>Acompanhe o mês selecionado, atrasos e pagamentos realizados sem perder histórico.</p>
        </div>
        <Link className="primary-button" href={contextHref("/dividas/nova", currentContext.id)}>
          <Icon name="add" />
          Nova dívida
        </Link>
      </section>

      <section className="metric-grid debt-metrics" aria-label="Resumo das dívidas">
        <article className="metric-card metric-card-featured">
          <span>Dívida do casal</span>
          <strong>{formatCurrency(overview.coupleOutstanding)}</strong>
          <small>Restante total em aberto</small>
        </article>
        {overview.editors.slice(0, 2).map((editor) => (
          <article className="metric-card" key={editor.id}>
            <span>Dívida de {editor.displayName}</span>
            <strong>{formatCurrency(editor.outstanding)}</strong>
            <small>Responsabilidade individual restante</small>
          </article>
        ))}
        <article className="metric-card">
          <span>Parcelas de {MONTH_FORMATTER.format(overview.month)}</span>
          <strong>{formatCurrency(overview.dueThisMonth)}</strong>
          <small>
            {formatCurrency(overview.paidThisMonth)} pagos · {formatCurrency(overview.pendingThisMonth)} pendentes
          </small>
        </article>
        {overview.editors.slice(0, 2).map((editor) => (
          <article className="metric-card" key={`monthly-${editor.id}`}>
            <span>{editor.displayName} em {MONTH_FORMATTER.format(overview.month)}</span>
            <strong>{formatCurrency(editor.dueThisMonth)}</strong>
            <small>Responsabilidade individual do mês</small>
          </article>
        ))}
      </section>

      <nav className="person-filter" aria-label="Navegar mês das dívidas">
        <Link href={debtsHref(previousMonthInput, currentContext.id, selectedEditor?.id)}>Mês anterior</Link>
        <Link className="active" href={debtsHref(selectedMonthInput, currentContext.id, selectedEditor?.id)}>
          {MONTH_FORMATTER.format(overview.month)}
        </Link>
        <Link href={debtsHref(nextMonthInput, currentContext.id, selectedEditor?.id)}>Próximo mês</Link>
      </nav>

      <nav className="person-filter" aria-label="Filtrar dívidas por pessoa">
        <Link className={!selectedEditor ? "active" : ""} href={debtsHref(selectedMonthInput, currentContext.id)}>
          Casal
        </Link>
        {overview.editors.map((editor) => (
          <Link
            className={selectedEditor?.id === editor.id ? "active" : ""}
            href={debtsHref(selectedMonthInput, currentContext.id, editor.id)}
            key={editor.id}
          >
            {editor.displayName}
          </Link>
        ))}
      </nav>

      {debts.length === 0 ? (
        <EmptyState
          action={{ href: contextHref("/dividas/nova", currentContext.id), label: "Cadastrar dívida" }}
          description="Cadastre uma compra individual ou conjunta para começar o acompanhamento."
          icon="debt"
          title="Nenhuma dívida encontrada"
        />
      ) : (
        <section className="debt-list" aria-label="Dívidas cadastradas">
          {debts.map((debt) => {
            const canceled = Boolean(debt.canceledAt);
            const settled = !canceled && debt.outstanding.isZero();
            const installmentProgress = debt.installmentCount > 0
              ? Math.min((debt.paidCount / debt.installmentCount) * 100, 100)
              : 0;
            const responsiblePeople = [...debt.originalByEditor.entries()].map(
              ([editorId, amount]) => ({
                amount,
                editorId,
                name:
                  debt.installments
                    .flatMap(({ shares }) => shares)
                    .find((share) => share.editorId === editorId)?.editor.displayName ?? "Pessoa",
              }),
            );
            const visibleInstallments = [
              ...debt.overdueInstallments,
              ...debt.monthInstallments.filter(
                (installment) =>
                  !debt.overdueInstallments.some((overdue) => overdue.id === installment.id),
              ),
            ];
            const summaryInstallments = debt.monthInstallments.length > 0
              ? debt.monthInstallments
              : debt.overdueInstallments;
            const summaryAmount = sumMoney(
              selectedEditor
                ? summaryInstallments.flatMap((installment) =>
                    installment.shares
                      .filter(({ editorId }) => editorId === selectedEditor.id)
                      .map(({ amount }) => amount),
                  )
                : summaryInstallments.map(({ amount }) => amount),
            );
            const summaryInstallmentsLabel = summaryInstallments
              .map(({ number }) => `${number}/${debt.installmentCount}`)
              .join(" e ");
            const summaryPaid = summaryInstallments.length > 0
              && summaryInstallments.every(({ status }) => status === "PAID");
            const summaryOverdue = debt.overdueInstallments.length > 0;
            const summaryStatus = canceled
              ? "Cancelada"
              : summaryOverdue
                ? "Atrasada"
                : summaryPaid
                  ? "Paga"
                  : "Pendente";
            const summaryStatusClass = canceled
              ? "status-canceled"
              : summaryOverdue
                ? "status-overdue"
                : summaryPaid
                  ? "status-paid"
                  : "status-pending";

            return (
              <article className={`debt-card debt-card-collapsible${canceled ? " entity-row-muted" : ""}`} key={debt.id}>
                <details className="debt-disclosure">
                  <summary className="debt-compact-summary">
                    <span className="debt-compact-copy">
                      <span className="debt-compact-month">
                        Mês de {MONTH_FORMATTER.format(overview.month)}
                      </span>
                      <strong>
                        {debt.description} ({summaryInstallmentsLabel})
                      </strong>
                      <small>{debt.financialContext.name}</small>
                      <small>
                        {debt.category.name} · {responsiblePeople.map(({ name }) => name).join(" e ")} · Ver detalhes
                      </small>
                    </span>
                    <span className="debt-compact-value">
                      <small>{selectedEditor ? `Valor de ${selectedEditor.displayName}` : "Valor no mês"}</small>
                      <strong>{formatCurrency(summaryAmount)}</strong>
                      <span className={`status-pill ${summaryStatusClass}`}>{summaryStatus}</span>
                    </span>
                    <span className="debt-expand-indicator" aria-hidden="true" />
                  </summary>

                  <div className="debt-expanded-content">
                    <header>
                  <div>
                    <span
                      className={`status-pill ${
                        canceled ? "status-canceled" : settled ? "status-settled" : "status-pending"
                      }`}
                    >
                      {canceled ? "Cancelada" : settled ? "Quitada" : "Em aberto"}
                    </span>
                    <h2>{debt.description}</h2>
                    <p>
                      {debt.category.name} · {debt.paymentMethod === "CREDIT_CARD" ? debt.cardName : "Outra dívida"} · {debt.installmentFrequency === "FORTNIGHTLY" ? "quinzenal" : "mensal"} · compra em{" "}
                      {formatDate(debt.purchaseDate)}
                    </p>
                  </div>
                  <div className="debt-total">
                    <span>Falta pagar</span>
                    <strong>{formatCurrency(debt.outstanding)}</strong>
                    <small>de {formatCurrency(debt.totalAmount)} contratados</small>
                  </div>
                    </header>

                <div className="debt-key-summary" aria-label="Resumo da dívida">
                  <span>
                    <strong>{formatCurrency(debt.paidAmount)}</strong>
                    pago até agora
                  </span>
                  <span>
                    <strong>{debt.paidCount}/{debt.installmentCount}</strong>
                    parcelas pagas
                  </span>
                  <span>
                    <strong>{formatCurrency(debt.outstanding)}</strong>
                    restantes
                  </span>
                </div>

                <div
                  className="debt-progress"
                  aria-label={`${debt.paidCount} de ${debt.installmentCount} parcelas pagas`}
                >
                  <div>
                    <span>Progresso das parcelas</span>
                    <strong>
                      {debt.paidCount}/{debt.installmentCount}
                    </strong>
                  </div>
                  <div className="progress-track">
                    <span style={{ width: `${installmentProgress}%` }} />
                  </div>
                </div>

                <div className="debt-responsibility">
                  {responsiblePeople.map((person) => (
                    <span key={person.editorId}>
                      <strong>{person.name}</strong>
                      {formatCurrency(person.amount)} originalmente ·{" "}
                      {formatCurrency(debt.outstandingByEditor.get(person.editorId) ?? 0)}{" "}
                      restantes
                    </span>
                  ))}
                </div>

                {debt.nextInstallment ? (
                  <p className={debt.nextInstallment.dueDate < today ? "debt-overdue" : "debt-next"}>
                    Próxima ação: parcela {debt.nextInstallment.number}/{debt.installmentCount} ·{" "}
                    {formatCurrency(debt.nextInstallment.amount)} · vence em{" "}
                    {formatDate(debt.nextInstallment.dueDate)}
                  </p>
                ) : null}

                <details className="installment-details">
                  <summary>Ver parcelas do mês e atrasadas</summary>
                  <div className="installment-list">
                    {visibleInstallments.map((installment) => (
                      <article className="installment-row" key={installment.id}>
                        <div>
                          <strong>
                            Parcela {installment.number}/{debt.installmentCount}
                          </strong>
                          <span>
                            {formatDate(installment.dueDate)} ·{" "}
                            {installment.shares
                              .map(
                                (share) =>
                                  `${share.editor.displayName}: ${formatCurrency(share.amount)}`,
                              )
                              .join(" · ")}
                          </span>
                        </div>
                        <div className="installment-value">
                          <strong>{formatCurrency(installment.amount)}</strong>
                          <span className={`status-pill status-${installment.status.toLowerCase()}`}>
                            {installment.status === "PAID"
                              ? installment.historical
                                ? "Paga antes do sistema"
                                : "Paga"
                              : installment.status === "PENDING"
                                ? installment.dueDate < today
                                  ? "Atrasada"
                                  : "Pendente"
                                : "Cancelada"}
                          </span>
                        </div>
                        {installment.status === "PENDING" && accounts.length > 0 ? (
                          <PayInstallmentForm
                            accounts={accounts}
                            action={payDebtInstallmentAction}
                            currentDate={todayInput}
                            installmentId={installment.id}
                            version={installment.version}
                          />
                        ) : null}
                      </article>
                    ))}
                  </div>
                </details>

                    {!canceled && !settled && debt.paidCount === 0 ? (
                  <div className="debt-actions">
                    <ConfirmActionForm
                      action={cancelDebtAction}
                      fields={{ id: debt.id, version: String(debt.version) }}
                      label="Excluir dívida"
                      message="Excluir esta dívida ainda sem pagamentos? As parcelas previstas serão removidas. Use apenas quando o cadastro foi criado por engano."
                    />
                  </div>
                ) : !canceled && debt.paidCount > 0 ? (
                  <p className="debt-history-note">
                    Esta dívida já possui pagamentos registrados. O histórico permanece preservado e não pode ser excluído por aqui.
                  </p>
                    ) : null}
                  </div>
                </details>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
