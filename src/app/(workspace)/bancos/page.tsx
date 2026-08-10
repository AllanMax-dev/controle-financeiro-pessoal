import Link from "next/link";

import { AccountStatusActionForm } from "@/components/account-status-action-form";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icons";
import { formatCurrency } from "@/lib/format";
import { requireCurrentAccess } from "@/modules/access/application/require-current-access";
import { toggleAccountActiveFormAction } from "@/modules/accounts/application/account-actions";
import { getAccountBalances } from "@/modules/accounts/application/get-account-balances";
import {
  contextHref,
  resolveFinancialContext,
  selectedContextIdFromSearchParams,
  type FinancialContextSearchParams,
} from "@/modules/financial-contexts/application/financial-contexts";

const accountTypeLabels = {
  CHECKING: "Conta corrente",
  SAVINGS: "PoupanÃ§a",
  CASH: "Dinheiro",
  DIGITAL: "Conta digital",
  INVESTMENT: "Investimento",
  OTHER: "Outra",
} as const;

export default async function BanksPage({
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
  const balances = await getAccountBalances(access.workspaceId, true, currentContext.id);
  const accounts = balances.activeAccounts.filter(({ type }) => type !== "INVESTMENT");

  return (
    <>
      <section className="page-heading compact-heading">
        <div>
          <p className="eyebrow">Bancos</p>
          <h1>Contas operacionais</h1>
          <p>Dinheiro disponÃ­vel para o dia a dia, separado dos investimentos.</p>
        </div>
        <div className="page-actions">
          <Link className="primary-button" href={contextHref("/contas/nova", currentContext.id)}>
            <Icon name="add" />
            Nova conta
          </Link>
          <Link className="secondary-button" href={contextHref("/transferencias/nova", currentContext.id)}>
            <Icon name="transfer" />
            Transferir
          </Link>
        </div>
      </section>

      <section className="metric-grid" aria-label="Resumo bancÃ¡rio">
        <article className="metric-card metric-card-featured">
          <span>Saldo disponÃ­vel</span>
          <strong>{formatCurrency(balances.availableBalance)}</strong>
          <small>{accounts.length} contas operacionais</small>
        </article>
        <article className="metric-card">
          <span>PatrimÃ´nio separado</span>
          <strong>{formatCurrency(balances.investmentBalance)}</strong>
          <small>Investimentos nÃ£o entram no disponÃ­vel</small>
        </article>
      </section>

      {accounts.length === 0 ? (
        <EmptyState
          action={{ href: contextHref("/contas/nova", currentContext.id), label: "Criar conta" }}
          description="Crie uma conta corrente, digital, poupanÃ§a ou dinheiro para operar o contexto atual."
          icon="bank"
          title="Nenhuma conta operacional"
        />
      ) : (
        <section className="entity-list compact-entity-list" aria-label="Contas bancÃ¡rias">
          {accounts.map((account) => (
            <article className="entity-row account-row" key={account.id}>
              <span className="entity-color" style={{ backgroundColor: account.color ?? "#e85d25" }} />
              <div className="entity-main">
                <strong>{account.name}</strong>
                <span>{accountTypeLabels[account.type]}</span>
              </div>
              <div className="entity-value">
                <strong>{formatCurrency(account.balance)}</strong>
                <span className="status-pill status-settled">Ativa</span>
              </div>
              <div className="row-actions">
                <Link className="text-button" href={contextHref(`/contas/${account.id}/editar`, currentContext.id)}>
                  Editar
                </Link>
                <Link className="text-button" href={contextHref(`/contas/${account.id}/ajustar`, currentContext.id)}>
                  Ajustar saldo
                </Link>
                <AccountStatusActionForm
                  accountId={account.id}
                  active={false}
                  stateAction={toggleAccountActiveFormAction}
                  version={account.version}
                />
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
