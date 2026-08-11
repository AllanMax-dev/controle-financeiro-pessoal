import Link from "next/link";

import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import {
  contextHref,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";

export default async function InvestmentsPage({
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
  const balances = await getAccountBalances(access.workspaceId, true, contextState.scope);
  const investments = balances.activeAccounts.filter(({ type }) => type === "INVESTMENT");

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Investimentos</p>
          <h1>Patrimônio investido</h1>
          <p>Investimentos aparecem separados do dinheiro operacional disponível.</p>
        </div>
        <Link className="primary-button" href={contextHref("/contas/nova", currentContext.id)}>
          <Icon name="add" />
          Novo investimento
        </Link>
      </section>

      <section className="metric-grid" aria-label="Resumo dos investimentos">
        <article className="metric-card metric-card-featured">
          <span>Total investido</span>
          <strong>{formatCurrency(balances.investmentBalance)}</strong>
          <small>{investments.length} contas de investimento</small>
        </article>
        <article className="metric-card">
          <span>Saldo operacional</span>
          <strong>{formatCurrency(balances.availableBalance)}</strong>
          <small>Não inclui investimentos</small>
        </article>
        <article className="metric-card">
          <span>Patrimônio financeiro</span>
          <strong>{formatCurrency(balances.totalBalance)}</strong>
          <small>Disponível + investimentos</small>
        </article>
      </section>

      {investments.length === 0 ? (
        <EmptyState
          action={{ href: contextHref("/contas/nova", currentContext.id), label: "Criar investimento" }}
          description="Cadastre uma conta do tipo investimento para separar patrimônio do caixa do dia a dia."
          icon="investment"
          title="Nenhum investimento cadastrado"
        />
      ) : (
        <section className="entity-list compact-entity-list" aria-label="Investimentos">
          {investments.map((account) => (
            <article className="entity-row account-row" key={account.id}>
              <span className="entity-color" style={{ backgroundColor: account.color ?? "#1f8a70" }} />
              <div className="entity-main">
                <strong>{account.name}</strong>
                <span>Investimento · separado do saldo disponível</span>
              </div>
              <div className="entity-value">
                <strong>{formatCurrency(account.balance)}</strong>
                <span className="status-pill status-settled">Ativo</span>
              </div>
              <div className="row-actions">
                <Link className="text-button" href={contextHref(`/contas/${account.id}/editar`, currentContext.id)}>
                  Editar
                </Link>
                <Link className="text-button" href={contextHref(`/contas/${account.id}/ajustar`, currentContext.id)}>
                  Ajustar saldo
                </Link>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
