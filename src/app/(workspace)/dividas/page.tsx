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

export default async function DebtsPage({
  searchParams,
}: {
  searchParams: Promise<{ person?: string }>;
}) {
  const access = await requireCurrentAccess();
  const database = getDatabase();
  const filters = await searchParams;
  const [overview, accounts] = await Promise.all([
    getDebtOverview(access.workspaceId),
    database.financialAccount.findMany({
      where: { workspaceId: access.workspaceId, active: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const selectedEditor = overview.editors.find(({ id }) => id === filters.person);
  const debts = selectedEditor
    ? overview.debts.filter((debt) =>
        debt.installments.some((installment) =>
          installment.shares.some(({ editorId }) => editorId === selectedEditor.id),
        ),
      )
    : overview.debts;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">Responsabilidades</p>
          <h1>Dívidas do casal</h1>
          <p>Acompanhe valores individuais, compras conjuntas, parcelas e pagamentos.</p>
        </div>
        <Link className="primary-button" href="/dividas/nova">
          <Icon name="add" />
          Nova dívida
        </Link>
      </section>

      <section className="metric-grid debt-metrics" aria-label="Resumo das dívidas">
        <article className="metric-card metric-card-featured">
          <span>Dívida do casal</span>
          <strong>{formatCurrency(overview.coupleOutstanding)}</strong>
          <small>Somente parcelas ainda não pagas</small>
        </article>
        {overview.editors.slice(0, 2).map((editor) => (
          <article className="metric-card" key={editor.id}>
            <span>Dívida de {editor.displayName}</span>
            <strong>{formatCurrency(editor.outstanding)}</strong>
            <small>Responsabilidade individual restante</small>
          </article>
        ))}
        <article className="metric-card">
          <span>Parcelas deste mês</span>
          <strong>{formatCurrency(overview.dueThisMonth)}</strong>
          <small className={overview.overdue.isPositive() ? "value-expense" : ""}>
            {formatCurrency(overview.overdue)} em atraso
          </small>
        </article>
      </section>

      <nav className="person-filter" aria-label="Filtrar dívidas por pessoa">
        <Link className={!selectedEditor ? "active" : ""} href="/dividas">
          Casal
        </Link>
        {overview.editors.map((editor) => (
          <Link
            className={selectedEditor?.id === editor.id ? "active" : ""}
            href={`/dividas?person=${editor.id}`}
            key={editor.id}
          >
            {editor.displayName}
          </Link>
        ))}
      </nav>

      {debts.length === 0 ? (
        <EmptyState
          action={{ href: "/dividas/nova", label: "Cadastrar dívida" }}
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

            return (
              <article className={`debt-card${canceled ? " entity-row-muted" : ""}`} key={debt.id}>
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
                      {debt.category.name} · {debt.paymentMethod === "CREDIT_CARD" ? debt.cardName : "Outra dívida"} · compra em{" "}
                      {formatDate(debt.purchaseDate)}
                    </p>
                  </div>
                  <div className="debt-total">
                    <span>Saldo devedor</span>
                    <strong>{formatCurrency(debt.outstanding)}</strong>
                    <small>
                      {debt.paidCount} de {debt.installmentCount} parcelas pagas
                    </small>
                  </div>
                </header>

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
                    Próxima parcela: {debt.nextInstallment.number}/{debt.installmentCount} ·{" "}
                    {formatCurrency(debt.nextInstallment.amount)} · vence em{" "}
                    {formatDate(debt.nextInstallment.dueDate)}
                  </p>
                ) : null}

                <details className="installment-details">
                  <summary>Ver todas as parcelas</summary>
                  <div className="installment-list">
                    {debt.installments.map((installment) => (
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
                            installmentId={installment.id}
                            version={installment.version}
                          />
                        ) : null}
                      </article>
                    ))}
                  </div>
                </details>

                {!canceled && !settled ? (
                  <div className="debt-actions">
                    <ConfirmActionForm
                      action={cancelDebtAction}
                      fields={{ id: debt.id, version: String(debt.version) }}
                      label="Cancelar dívida"
                      message="Cancelar esta dívida? Parcelas já pagas permanecerão no histórico."
                    />
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
