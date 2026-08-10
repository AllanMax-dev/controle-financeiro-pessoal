import Link from "next/link";

import {
  CreditCardForm,
  CreditCardPurchaseForm,
} from "@/components/credit-card-forms";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { getDatabase } from "@/lib/db";
import { formatCurrency, formatDate } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import {
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
  const today = dateInputInTimeZone(new Date(), access.workspaceTimezone);
  const [overview, accounts, categories] = await Promise.all([
    getCreditCardOverview(access.workspaceId, currentContext.id),
    database.financialAccount.findMany({
      where: {
        active: true,
        contextId: currentContext.id,
        type: { not: "INVESTMENT" },
        workspaceId: access.workspaceId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    database.category.findMany({
      where: {
        active: true,
        contextId: currentContext.id,
        kind: "EXPENSE",
        workspaceId: access.workspaceId,
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">CartÃµes de crÃ©dito</p>
          <h1>Faturas e compras</h1>
          <p>Controle limite, vencimento e compras parceladas sem misturar com dÃ­vidas comuns.</p>
        </div>
      </section>

      <section className="metric-grid" aria-label="Resumo dos cartÃµes">
        <article className="metric-card metric-card-featured">
          <span>Fatura atual</span>
          <strong>{formatCurrency(overview.totalCurrentInvoice)}</strong>
          <small>{overview.cards.filter(({ active }) => active).length} cartÃµes ativos</small>
        </article>
        <article className="metric-card">
          <span>Limite total</span>
          <strong>{formatCurrency(overview.totalLimit)}</strong>
          <small>Separado do saldo disponÃ­vel</small>
        </article>
      </section>

      <section className="finance-workspace-grid">
        <div className="finance-form-stack">
          <CreditCardForm
            accounts={accounts}
            action={createCreditCardAction}
            contextId={currentContext.id}
          />
          {overview.cards.length > 0 ? (
            <CreditCardPurchaseForm
              action={createCreditCardPurchaseAction}
              cards={overview.cards.filter(({ active }) => active)}
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
              <p className="eyebrow">Seus cartÃµes</p>
              <h2>Fatura do mÃªs</h2>
            </div>
          </div>
          {overview.cards.length === 0 ? (
            <EmptyState
              description="Cadastre um cartÃ£o para acompanhar fatura, limite e compras parceladas."
              icon="card"
              title="Nenhum cartÃ£o cadastrado"
            />
          ) : (
            <div className="credit-card-list">
              {overview.cards.map((card) => (
                <article className="credit-card-summary" key={card.id}>
                  <header>
                    <span className="entity-color" style={{ backgroundColor: card.color ?? "#e85d25" }} />
                    <div>
                      <strong>{card.name}</strong>
                      <small>{card.institution ?? card.paymentAccount?.name ?? "Sem instituiÃ§Ã£o"}</small>
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
                      Limite disponÃ­vel
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
                              {installment.purchase.category?.name ?? "Sem categoria"} Â· parcela {installment.number}/{installment.purchase.installmentCount}
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
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
    </>
  );
}
