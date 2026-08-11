import Link from "next/link";

import {
  CreditCardInvoicePaymentForm,
  CreditCardForm,
  CreditCardPurchaseForm,
} from "@/components/credit-card-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
  payCreditCardInvoiceAction,
  createCreditCardAction,
  createCreditCardPurchaseAction,
} from "@/modules/credit-cards/application/credit-card-actions";
import { getCreditCardOverview } from "@/modules/credit-cards/application/get-credit-card-overview";
import {
  contextHref,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";
import { dateInputInTimeZone } from "@/modules/shared/domain/calendar";
import { money } from "@/modules/shared/domain/money";

export default async function CreditCardsPage({
  searchParams,
}: {
  searchParams: Promise<FinancialContextSearchParams>;
}) {
  const access = await requireCurrentAccess();
  const contextState = await resolveFinancialContext(
    access,
    selectedContextIdFromSearchParams(await searchParams),
  );
  const currentContext = contextState.current;
  const database = getDatabase();
  const writeContext = contextState.scope.writeContext;
  const today = dateInputInTimeZone(new Date(), access.workspaceTimezone);
  const [overview, accounts, categories] = await Promise.all([
    getCreditCardOverview(access.workspaceId, contextState.scope),
    database.financialAccount.findMany({
      where: {
        active: true,
        contextId: writeContext.id,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: {
        active: true,
        contextId: writeContext.id,
        kind: "EXPENSE",
        workspaceId: access.workspaceId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  const writableCards = overview.cards.filter(({ active, contextId }) => active && contextId === writeContext.id);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Cartões de crédito</p>
          <h1>Faturas e compras</h1>
          <p>Controle limite, vencimento e compras parceladas sem misturar com dívidas comuns.</p>
        </div>
      </section>

      <section className="metric-grid" aria-label="Resumo dos cartões">
        <article className="metric-card metric-card-featured">
          <span>Fatura atual</span>
          <strong>{formatCurrency(overview.totalCurrentInvoice)}</strong>
          <small>{overview.cards.filter(({ active }) => active).length} cartões ativos</small>
        </article>
        <article className="metric-card">
          <span>Limite total</span>
          <strong>{formatCurrency(overview.totalLimit)}</strong>
          <small>Separado do saldo disponível</small>
        </article>
        <article className="metric-card">
          <span>Limite disponivel</span>
          <strong>{formatCurrency(overview.totalAvailableLimit)}</strong>
          <small>Ja desconta faturas abertas</small>
        </article>
        <article className="metric-card">
          <span>Em aberto</span>
          <strong>{formatCurrency(overview.totalOutstanding)}</strong>
          <small>Compromissos atuais e futuros</small>
        </article>
      </section>

      <section className="finance-workspace-grid">
        <div className="finance-form-stack">
          <CreditCardForm
            accounts={accounts}
            action={createCreditCardAction}
            contextId={writeContext.id}
          />
          {writableCards.length > 0 ? (
            <CreditCardPurchaseForm
              action={createCreditCardPurchaseAction}
              cards={writableCards}
              categories={categories}
              today={today}
            />
          ) : null}
          <Link className="secondary-button" href={contextHref("/categorias/nova", currentContext.id)}>
            <Icon name="add" />
            Nova categoria
          </Link>
        </div>

        <section className="panel-card finance-list-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Seus cartões</p>
              <h2>Fatura do mês</h2>
            </div>
          </div>
          {overview.cards.length === 0 ? (
            <EmptyState
              description="Cadastre um cartão para acompanhar fatura, limite e compras parceladas."
              icon="card"
              title="Nenhum cartão cadastrado"
            />
          ) : (
            <div className="credit-card-list">
              {overview.cards.map((card) => (
                <article className="credit-card-summary" key={card.id}>
                  <header>
                    <span className="entity-color" style={{ backgroundColor: card.color ?? "#e85d25" }} />
                    <div>
                      <strong>{card.name}</strong>
                      <small>{card.financialContext.name}</small>
                      <small>{card.institution ?? card.paymentAccount?.name ?? "Sem instituição"}</small>
                    </div>
                    <span className={`status-pill status-${card.active ? "settled" : "canceled"}`}>
                      {card.active ? "Ativo" : "Encerrado"}
                    </span>
                  </header>
                  <div className="credit-card-values">
                    <span>
                      Fatura atual
                      <strong>{formatCurrency(card.invoiceAmount)}</strong>
                    </span>
                    <span>
                      Limite disponível
                      <strong>{formatCurrency(card.availableLimit)}</strong>
                    </span>
                  </div>
                  <div className="progress-track" aria-label={`${card.usagePercent.toFixed(0)}% do limite usado`}>
                    <span style={{ width: `${card.usagePercent}%` }} />
                  </div>
                  <footer>
                    <span>Fecha dia {card.closingDay}</span>
                    <span>Vence dia {card.dueDay}</span>
                  </footer>
                  {card.currentInvoice ? (
                    <ul className="compact-finance-list">
                      {card.invoiceInstallments.slice(0, 4).map((installment) => (
                        <li key={installment.id}>
                          <span>
                            <strong>{installment.purchase.description}</strong>
                            <small>
                              {installment.purchase.category?.name ?? "Sem categoria"} · parcela {installment.number}/{installment.purchase.installmentCount}
                            </small>
                          </span>
                          <strong>{formatCurrency(installment.amount)}</strong>
                        </li>
                      ))}
                      <li>
                        <span>
                          <strong>Vencimento</strong>
                          <small>{formatDate(card.currentInvoice.dueDate)}</small>
                        </span>
                        <span className={`status-pill status-${card.currentInvoice.status.toLowerCase()}`}>
                          {card.currentInvoice.status === "OPEN" ? "Aberta" : card.currentInvoice.status}
                        </span>
                      </li>
                    </ul>
                  ) : (
                    <div className="compact-empty">Nenhuma compra nesta fatura.</div>
                  )}
                  {card.currentInvoice && card.contextId === writeContext.id && money(card.currentInvoice.amount).minus(card.currentInvoice.paidAmount).isPositive() ? (
                    <CreditCardInvoicePaymentForm
                      accounts={accounts}
                      action={payCreditCardInvoiceAction}
                      defaultAmount={money(card.currentInvoice.amount).minus(card.currentInvoice.paidAmount).toFixed(2).replace(".", ",")}
                      invoiceId={card.currentInvoice.id}
                      today={today}
                    />
                  ) : null}
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </>
  );
}
